import { isSupportedCurrency } from '@/domain/currencies'
import type { IsoDate, TaxLine } from '@/domain/types'
import { normalizeDigits, parseDocumentDate, parseLocalizedAmount, type DateOrder } from '../text'

/**
 * Rule-based field extraction from recognised receipt/invoice text (Arabic and English).
 * It only reports values it actually finds; anything missing stays empty for the user to fill in.
 * Nothing here guesses amounts or invents confidence scores.
 */

export type Region = 'auto' | 'eg' | 'gcc' | 'eu' | 'us' | 'uk' | 'in' | 'other'

export interface ExtractedField<T> {
  value: T | null
  /** The line the value was read from, shown to the user for checking. */
  line: string | null
}

export interface ExtractedInvoice {
  merchant: ExtractedField<string>
  merchantTaxId: ExtractedField<string>
  invoiceNumber: ExtractedField<string>
  issueDate: ExtractedField<IsoDate>
  dueDate: ExtractedField<IsoDate>
  currency: ExtractedField<string>
  subtotalMinor: ExtractedField<number>
  discountMinor: ExtractedField<number>
  taxMinor: ExtractedField<number>
  totalMinor: ExtractedField<number>
  taxLines: TaxLine[]
  /** Arithmetic problems found, e.g. subtotal − discount + tax ≠ total. */
  discrepancies: string[]
  detectedRegion: Region
}

const empty = <T>(): ExtractedField<T> => ({ value: null, line: null })

const CURRENCY_HINTS: [RegExp, string][] = [
  [/\bEGP\b|ج\.?\s?م\b|جنيه|L\.?E\.?\b/i, 'EGP'],
  [/\bSAR\b|ر\.?\s?س\b|ريال سعودي|﷼/i, 'SAR'],
  [/\bAED\b|د\.?\s?إ\b|درهم/i, 'AED'],
  [/\bKWD\b|د\.?\s?ك\b|دينار كويتي/i, 'KWD'],
  [/\bQAR\b|ر\.?\s?ق\b|ريال قطري/i, 'QAR'],
  [/\bBHD\b|د\.?\s?ب\b|دينار بحريني/i, 'BHD'],
  [/\bOMR\b|ر\.?\s?ع\b|ريال عماني/i, 'OMR'],
  [/\bJOD\b|دينار أردني/i, 'JOD'],
  [/\bINR\b|₹|\bRs\.?\s/i, 'INR'],
  [/\bEUR\b|€/i, 'EUR'],
  [/\bGBP\b|£/i, 'GBP'],
  [/\bUSD\b|US\$|\$/i, 'USD'],
]

const REGION_BY_CURRENCY: Record<string, Region> = {
  EGP: 'eg', SAR: 'gcc', AED: 'gcc', KWD: 'gcc', QAR: 'gcc', BHD: 'gcc', OMR: 'gcc', EUR: 'eu', GBP: 'uk', USD: 'us', INR: 'in',
}

const TOTAL_LABELS = /(grand\s*total|total\s*(amount|due|payable)?|amount\s*due|balance\s*due|net\s*total|الإجمالي|الاجمالي|الإجمالى|الاجمالى|المجموع الكلي|المبلغ الإجمالي|الإجمالي شامل|إجمالي الفاتورة|اجمالي الفاتورة|المطلوب|الصافي)/i
const SUBTOTAL_LABELS = /(sub\s*-?\s*total|total\s*before\s*(tax|vat)|net\s*amount|taxable\s*amount|المجموع الفرعي|الإجمالي قبل الضريبة|الاجمالي قبل الضريبة|قبل الضريبة|المبلغ الخاضع)/i
const TAX_LABELS = /(\bvat\b|value\s*added\s*tax|sales\s*tax|\btax\b|\bgst\b|cgst|sgst|igst|ضريبة القيمة المضافة|ض\.?\s?ق\.?\s?م|الضريبة|ضريبة)/i
const DISCOUNT_LABELS = /(discount|خصم|الخصم)/i
const INVOICE_NO_LABELS = /(invoice\s*(no|number|#)|receipt\s*(no|number|#)|bill\s*(no|number)|inv\s*#|رقم الفاتورة|رقم الإيصال|رقم الايصال|فاتورة رقم|رقم المستند)\s*[:#.]?\s*([A-Za-z0-9\-/]+)/i
const TAX_ID_LABELS = /(tax\s*(registration|reg\.?|id)\s*(no|number)?|vat\s*(reg\.?\s*)?(no|number|#)|\btrn\b|\bgstin\b|رقم التسجيل الضريبي|الرقم الضريبي|رقم ضريبي|ر\.?\s?ض|التسجيل الضريبي)\s*[:#.]?\s*([A-Za-z0-9-]{5,20})/i
const DATE_LABELS = /(date|issued|تاريخ|التاريخ)/i
const DUE_LABELS = /(due\s*date|payment\s*due|pay\s*by|تاريخ الاستحقاق|تاريخ السداد|آخر موعد)/i

const AMOUNT_RE = /-?\d[\d.,\s\u00a0]*\d|\d/g

function lastAmount(line: string, currency: string): number | null {
  // Remove percentages so "VAT 14%" doesn't read as 14.
  const cleaned = normalizeDigits(line).replace(/\d+(\.\d+)?\s*%/g, ' ')
  const matches = cleaned.match(AMOUNT_RE)
  if (!matches) return null
  for (let i = matches.length - 1; i >= 0; i--) {
    const value = parseLocalizedAmount(matches[i] ?? '', currency)
    if (value !== null && value >= 0) return value
  }
  return null
}

function detectCurrency(text: string): ExtractedField<string> {
  for (const line of text.split('\n')) {
    const code = /\b([A-Z]{3})\b/.exec(line)?.[1]
    for (const [pattern, currency] of CURRENCY_HINTS) {
      if (pattern.test(line)) return { value: currency, line: line.trim() }
    }
    if (code && isSupportedCurrency(code) && /\d/.test(line)) return { value: code, line: line.trim() }
  }
  return empty()
}

export function extractInvoiceFields(rawText: string, options: { region?: Region; fallbackCurrency?: string } = {}): ExtractedInvoice {
  const text = rawText.replace(/\r/g, '')
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const currency = detectCurrency(text)
  const cur = currency.value ?? options.fallbackCurrency ?? 'EGP'
  const detectedRegion: Region =
    options.region && options.region !== 'auto' ? options.region : currency.value ? (REGION_BY_CURRENCY[currency.value] ?? 'other') : 'other'
  const order: DateOrder = detectedRegion === 'us' ? 'mdy' : 'dmy'

  const result: ExtractedInvoice = {
    merchant: empty(),
    merchantTaxId: empty(),
    invoiceNumber: empty(),
    issueDate: empty(),
    dueDate: empty(),
    currency,
    subtotalMinor: empty(),
    discountMinor: empty(),
    taxMinor: empty(),
    totalMinor: empty(),
    taxLines: [],
    discrepancies: [],
    detectedRegion,
  }

  // Merchant: first line with letters that isn't a label like "Invoice" / "فاتورة".
  const merchantLine = lines.slice(0, 5).find((l) => /[A-Za-z؀-ۿ]{2,}/.test(l) && !/^(tax\s*)?invoice|^receipt|^فاتورة|^إيصال|^ايصال/i.test(l))
  if (merchantLine) result.merchant = { value: merchantLine.replace(/\s{2,}/g, ' '), line: merchantLine }

  let totalCandidate: { value: number; line: string; priority: number } | null = null

  for (const line of lines) {
    const n = normalizeDigits(line)
    if (!result.invoiceNumber.value) {
      const m = INVOICE_NO_LABELS.exec(n)
      // The value is the last capture group; it must contain a digit so a heading like "Invoice No." is not read as a number.
      const value = m?.[m.length - 1]
      if (value && /\d/.test(value)) result.invoiceNumber = { value, line }
    }
    if (!result.merchantTaxId.value) {
      const m = TAX_ID_LABELS.exec(n)
      const id = m?.[m.length - 1]
      if (id && id.replace(/\D/g, '').length >= 5) result.merchantTaxId = { value: id, line }
    }
    if (DUE_LABELS.test(n)) {
      const d = parseDocumentDate(n, order)
      if (d && !result.dueDate.value) result.dueDate = { value: d, line }
      continue
    }
    if (!result.issueDate.value && DATE_LABELS.test(n)) {
      const d = parseDocumentDate(n, order)
      if (d) result.issueDate = { value: d, line }
    }
    if (SUBTOTAL_LABELS.test(n)) {
      const v = lastAmount(n, cur)
      if (v !== null && result.subtotalMinor.value === null) result.subtotalMinor = { value: v, line }
      continue
    }
    if (DISCOUNT_LABELS.test(n)) {
      const v = lastAmount(n, cur)
      if (v !== null && result.discountMinor.value === null) result.discountMinor = { value: v, line }
      continue
    }
    if (TAX_LABELS.test(n) && !TOTAL_LABELS.test(n.replace(TAX_LABELS, ''))) {
      const v = lastAmount(n, cur)
      if (v !== null && !/(registration|reg\.|\bno\b|number|رقم|التسجيل)/i.test(n)) {
        const rate = /(\d+(?:\.\d+)?)\s*%/.exec(n)?.[1] ?? ''
        result.taxLines.push({ label: line.replace(/[\d.,%\s]+$/, '').trim().slice(0, 40) || 'Tax', rate, amountMinor: v })
      }
      continue
    }
    if (TOTAL_LABELS.test(n)) {
      const v = lastAmount(n, cur)
      if (v !== null) {
        const priority = /grand|amount\s*due|balance\s*due|الإجمالي شامل|المطلوب|إجمالي الفاتورة|اجمالي الفاتورة/i.test(n) ? 2 : 1
        // Prefer the strongest label; among equals, the later line (totals come last).
        if (!totalCandidate || priority >= totalCandidate.priority) totalCandidate = { value: v, line, priority }
      }
    }
  }

  if (!result.issueDate.value) {
    const dateLine = lines.find((l) => parseDocumentDate(l, order))
    if (dateLine) result.issueDate = { value: parseDocumentDate(dateLine, order), line: dateLine }
  }
  if (result.taxLines.length > 0) {
    result.taxMinor = { value: result.taxLines.reduce((s, t) => s + t.amountMinor, 0), line: result.taxLines.map((t) => t.label).join(', ') }
  }
  if (totalCandidate) result.totalMinor = { value: totalCandidate.value, line: totalCandidate.line }

  result.discrepancies = checkArithmetic(result.subtotalMinor.value, result.discountMinor.value, result.taxMinor.value, result.totalMinor.value)
  return result
}

/** Returns human-readable discrepancy codes when the printed figures don't add up. */
export function checkArithmetic(subtotal: number | null, discount: number | null, tax: number | null, total: number | null): string[] {
  if (subtotal === null || total === null) return []
  const afterDiscount = subtotal - (discount ?? 0)
  const exclusive = afterDiscount + (tax ?? 0)
  // Tax-inclusive receipts (common in the EU and GCC) print the tax "of which" — subtotal already equals total.
  if (Math.abs(exclusive - total) <= 1 || (tax !== null && Math.abs(afterDiscount - total) <= 1)) return []
  return ['total-mismatch']
}
