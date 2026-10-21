import type { ExtractionMethod, InvoiceKind, InvoiceLine, IsoDate, TaxLine } from '@/domain/types'
import { extractInvoiceFields, type ExtractedInvoice, type Region } from '@/lib/invoice/extract'
import { imageToCanvas, readPdf, recognize, scanQr, type OcrLanguage, type OcrProgress } from '@/lib/invoice/ocr'
import { interpretQr, parseEtaDocument, parseUblInvoice, type QrInterpretation, type StructuredInvoice } from '@/lib/invoice/structured'
import type { DetectedFileType } from '@/lib/files'

/** One field as presented for review: its value and where it came from (if anywhere). */
export interface ReviewField<T> {
  value: T | null
  /** Text line, file field or QR the value was read from; null when not found. */
  source: string | null
}

export interface ReadResult {
  method: ExtractionMethod
  kind: InvoiceKind
  merchant: ReviewField<string>
  merchantAddress: ReviewField<string>
  merchantTaxId: ReviewField<string>
  invoiceNumber: ReviewField<string>
  issueDate: ReviewField<IsoDate>
  dueDate: ReviewField<IsoDate>
  currency: ReviewField<string>
  subtotalMinor: ReviewField<number>
  discountMinor: ReviewField<number>
  taxMinor: ReviewField<number>
  totalMinor: ReviewField<number>
  taxLines: TaxLine[]
  lines: InvoiceLine[]
  discrepancies: string[]
  rawText: string
  qr: QrInterpretation | null
  qrText: string
  engineConfidence: number | null
}

const field = <T,>(value: T | null | undefined, source: string | null): ReviewField<T> => ({ value: value ?? null, source: value === null || value === undefined || value === '' ? null : source })

function fromExtracted(x: ExtractedInvoice, method: ExtractionMethod, rawText: string): ReadResult {
  return {
    method,
    kind: 'receipt',
    merchant: field(x.merchant.value, x.merchant.line),
    merchantAddress: field<string>(null, null),
    merchantTaxId: field(x.merchantTaxId.value, x.merchantTaxId.line),
    invoiceNumber: field(x.invoiceNumber.value, x.invoiceNumber.line),
    issueDate: field(x.issueDate.value, x.issueDate.line),
    dueDate: field(x.dueDate.value, x.dueDate.line),
    currency: field(x.currency.value, x.currency.line),
    subtotalMinor: field(x.subtotalMinor.value, x.subtotalMinor.line),
    discountMinor: field(x.discountMinor.value, x.discountMinor.line),
    taxMinor: field(x.taxMinor.value, x.taxMinor.line),
    totalMinor: field(x.totalMinor.value, x.totalMinor.line),
    taxLines: x.taxLines,
    lines: [],
    discrepancies: x.discrepancies,
    rawText,
    qr: null,
    qrText: '',
    engineConfidence: null,
  }
}

function fromStructured(s: StructuredInvoice, label: string): ReadResult {
  const src = (name: string) => `${label}: ${name}`
  return {
    method: s.format,
    kind: s.kind,
    merchant: field(s.merchant, src('merchant')),
    merchantAddress: field(s.merchantAddress, src('address')),
    merchantTaxId: field(s.merchantTaxId, src('tax id')),
    invoiceNumber: field(s.invoiceNumber, src('number')),
    issueDate: field(s.issueDate, src('date')),
    dueDate: field(s.dueDate, src('due date')),
    currency: field(s.currency, src('currency')),
    subtotalMinor: field(s.subtotalMinor, src('subtotal')),
    discountMinor: field(s.discountMinor, src('discount')),
    taxMinor: field(s.taxMinor, src('tax')),
    totalMinor: field(s.totalMinor, src('total')),
    taxLines: s.taxLines,
    lines: s.lines,
    discrepancies: [],
    rawText: '',
    qr: null,
    qrText: '',
    engineConfidence: null,
  }
}

/** Values decoded from a QR code fill fields the text reading missed (they never overwrite what the user sees as read). */
function mergeQr(result: ReadResult, qrText: string): ReadResult {
  const qr = interpretQr(qrText)
  const next: ReadResult = { ...result, qr, qrText }
  const inv = qr.invoice
  if (!inv) return next
  const fill = <K extends keyof ReadResult>(key: K, value: unknown, source: string) => {
    const current = next[key] as ReviewField<unknown>
    if (current.value === null && value !== null && value !== '' && value !== undefined) Object.assign(next, { [key]: { value, source } })
  }
  const label = qr.kind === 'zatca' ? 'ZATCA QR' : 'ETA QR'
  fill('merchant', inv.merchant, label)
  fill('merchantTaxId', inv.merchantTaxId, label)
  fill('issueDate', inv.issueDate, label)
  fill('currency', inv.currency, label)
  fill('taxMinor', inv.taxMinor, label)
  fill('totalMinor', inv.totalMinor, label)
  if (qr.kind === 'zatca' && next.method === 'ocr') next.method = 'zatca-qr'
  if (qr.kind === 'eta-link') next.kind = 'e-receipt'
  return next
}

export interface ReadOptions {
  languages: OcrLanguage[]
  region: Region
  fallbackCurrency: string
  rotation: 0 | 90 | 180 | 270
  crop?: { x: number; y: number; width: number; height: number }
}

export class NotStructuredError extends Error {
  constructor() {
    super('Not a recognised structured invoice.')
    this.name = 'NotStructuredError'
  }
}

/** Reads a validated file: structured data first, then the PDF text layer, then on-device OCR. */
export async function readDocument(file: Blob, type: Exclude<DetectedFileType, null | 'text/csv'>, options: ReadOptions, onProgress: (p: OcrProgress) => void, signal: AbortSignal): Promise<ReadResult> {
  if (type === 'application/json') {
    let json: unknown
    try {
      json = JSON.parse(await file.text())
    } catch {
      throw new NotStructuredError()
    }
    const parsed = parseEtaDocument(json)
    if (!parsed) throw new NotStructuredError()
    return fromStructured(parsed, 'ETA')
  }
  if (type === 'application/xml') {
    const parsed = parseUblInvoice(await file.text())
    if (!parsed) throw new NotStructuredError()
    return fromStructured(parsed, 'UBL')
  }

  const extract = (text: string, method: ExtractionMethod) =>
    fromExtracted(extractInvoiceFields(text, { region: options.region, fallbackCurrency: options.fallbackCurrency }), method, text)

  if (type === 'application/pdf') {
    const pdf = await readPdf(await file.arrayBuffer(), onProgress, signal)
    let qrText: string | null = null
    onProgress({ stage: 'scanning-qr', progress: null })
    for (const page of pdf.pages) {
      qrText = await scanQr(page)
      if (qrText) break
    }
    let result: ReadResult
    if (pdf.text.replace(/\s/g, '').length >= 40) {
      result = extract(pdf.text, 'pdf-text')
    } else {
      const texts: string[] = []
      let confidence: number | null = null
      for (const page of pdf.pages) {
        const r = await recognize(page, options.languages, onProgress, signal)
        texts.push(r.text)
        confidence = r.engineConfidence
      }
      result = { ...extract(texts.join('\n\n'), 'ocr'), engineConfidence: confidence }
    }
    return qrText ? mergeQr(result, qrText) : result
  }

  const canvas = await imageToCanvas(file, options.rotation, options.crop)
  onProgress({ stage: 'scanning-qr', progress: null })
  const qrText = await scanQr(canvas)
  const ocr = await recognize(canvas, options.languages, onProgress, signal)
  const result = { ...extract(ocr.text, 'ocr'), engineConfidence: ocr.engineConfidence }
  return qrText ? mergeQr(result, qrText) : result
}
