import { isSupportedCurrency, minorUnitDigits } from '@/domain/currencies'
import type { InvoiceLine, IsoDate, TaxLine } from '@/domain/types'
import { isValidIsoDate } from '../dates'
import { parseLocalizedAmount } from '../text'

/**
 * Parsers for structured invoice data. Reading these files or QR payloads is NOT official
 * verification: SpendWise only reads what the document says. Verification requires the issuing
 * authority's systems (see docs/RESEARCH.md).
 */

export interface StructuredInvoice {
  format: 'eta-json' | 'ubl-xml' | 'zatca-qr'
  kind: 'e-invoice' | 'e-receipt' | 'tax-invoice'
  merchant: string
  merchantTaxId: string
  merchantAddress: string
  invoiceNumber: string
  issueDate: IsoDate | null
  dueDate: IsoDate | null
  currency: string
  subtotalMinor: number | null
  discountMinor: number | null
  taxMinor: number | null
  totalMinor: number | null
  taxLines: TaxLine[]
  lines: InvoiceLine[]
  /** ETA document UUID, when present (used to build a link to the official portal). */
  uuid: string
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** Converts a JSON/XML decimal (number or string) to minor units via exact decimal text. */
export function decimalToMinor(value: unknown, currency: string): number | null {
  if (value === null || value === undefined || value === '') return null
  const text = typeof value === 'number' ? value.toFixed(minorUnitDigits(currency) + 2) : String(value)
  return parseLocalizedAmount(text, currency)
}

const isoFromDateTime = (v: unknown): IsoDate | null => {
  const s = str(v).slice(0, 10)
  return isValidIsoDate(s) ? s : null
}

// ETA tax type codes as published in the ETA SDK code tables (T1 is value-added tax).
const ETA_TAX_LABELS: Record<string, string> = { T1: 'VAT', T2: 'Table tax (percentage)', T3: 'Table tax (fixed)', T4: 'Withholding tax', T5: 'Stamping tax (percentage)', T6: 'Stamping tax (fixed)' }

/** Lower-cases every object key recursively: the ETA SDK warns JSON attribute casing may differ (e.g. internalId/internalID). */
function lowerKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lowerKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Json).map(([k, v]) => [k.toLowerCase(), lowerKeys(v)]))
  }
  return value
}

/**
 * Egyptian Tax Authority e-invoice (v1.0) or e-receipt (v1.2) JSON, as exported from the ETA portal,
 * an ERP/POS, or the Get Receipt Details response (with a "receipt" envelope). Field names follow the
 * ETA SDK and are matched case-insensitively.
 */
export function parseEtaDocument(json: unknown): StructuredInvoice | null {
  const root = obj(lowerKeys(json))
  const doc = obj(root.document ?? root.receipt ?? root)
  const seller = obj(doc.seller)
  // e-receipt: "header" + "seller" (or the flattened Get Receipt Details shape)
  if ((doc.header || doc.receiptnumber) && doc.seller) {
    const header = obj(doc.header ?? doc)
    const currency = str(header.currency).toUpperCase() || 'EGP'
    if (!isSupportedCurrency(currency)) return null
    const taxLines = arr(doc.taxtotals).map((t) => {
      const tax = obj(t)
      return { label: ETA_TAX_LABELS[str(tax.taxtype).toUpperCase()] ?? str(tax.taxtype), rate: '', amountMinor: decimalToMinor(tax.amount, currency) ?? 0 }
    })
    const address = obj(seller.branchaddress)
    return {
      format: 'eta-json',
      kind: 'e-receipt',
      merchant: str(seller.companytradename) || str(seller.branchname),
      merchantTaxId: str(seller.rin),
      merchantAddress: [str(address.buildingnumber), str(address.street), str(address.regioncity), str(address.governate)].filter(Boolean).join(', '),
      invoiceNumber: str(header.receiptnumber),
      issueDate: isoFromDateTime(header.datetimeissued),
      dueDate: null,
      currency,
      subtotalMinor: decimalToMinor(doc.totalsales, currency),
      discountMinor: decimalToMinor(doc.totalcommercialdiscount, currency),
      taxMinor: taxLines.length ? taxLines.reduce((s, t) => s + t.amountMinor, 0) : null,
      totalMinor: decimalToMinor(doc.totalamount, currency),
      taxLines,
      lines: arr(doc.itemdata).map((l) => {
        const line = obj(l)
        return {
          description: str(line.description) || str(line.internalcode),
          quantity: str(line.quantity),
          unitPriceMinor: decimalToMinor(line.unitprice, currency),
          totalMinor: decimalToMinor(line.total, currency),
        }
      }),
      uuid: str(header.uuid),
    }
  }
  // e-invoice: "issuer" + "invoiceLines"
  if (doc.issuer && doc.invoicelines) {
    const issuer = obj(doc.issuer)
    const address = obj(issuer.address)
    // ETA document totals are expressed in EGP (foreign-currency lines carry amountEGP).
    const currency = 'EGP'
    const taxLines = arr(doc.taxtotals).map((t) => {
      const tax = obj(t)
      return { label: ETA_TAX_LABELS[str(tax.taxtype).toUpperCase()] ?? str(tax.taxtype), rate: '', amountMinor: decimalToMinor(tax.amount, currency) ?? 0 }
    })
    return {
      format: 'eta-json',
      kind: 'e-invoice',
      merchant: str(issuer.name),
      merchantTaxId: str(issuer.id),
      merchantAddress: [str(address.buildingnumber), str(address.street), str(address.regioncity), str(address.governate)].filter(Boolean).join(', '),
      invoiceNumber: str(doc.internalid),
      issueDate: isoFromDateTime(doc.datetimeissued),
      dueDate: null,
      currency,
      subtotalMinor: decimalToMinor(doc.totalsalesamount, currency),
      discountMinor: decimalToMinor(doc.totaldiscountamount, currency),
      taxMinor: taxLines.length ? taxLines.reduce((s, t) => s + t.amountMinor, 0) : null,
      totalMinor: decimalToMinor(doc.totalamount, currency),
      taxLines,
      lines: arr(doc.invoicelines).map((l) => {
        const line = obj(l)
        return {
          description: str(line.description),
          quantity: str(line.quantity),
          unitPriceMinor: decimalToMinor(obj(line.unitvalue).amountegp, currency),
          totalMinor: decimalToMinor(line.total, currency),
        }
      }),
      uuid: str(doc.uuid),
    }
  }
  return null
}

const UBL_NS = {
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
}

/** UBL 2.1 invoice XML (EN 16931 / Peppol BIS Billing 3.0, also the basis of ZATCA and UAE e-invoices). */
export function parseUblInvoice(xml: string): StructuredInvoice | null {
  const dom = new DOMParser().parseFromString(xml, 'application/xml')
  if (dom.getElementsByTagName('parsererror').length) return null
  const root = dom.documentElement
  if (!root || !/^(Invoice|CreditNote)$/.test(root.localName)) return null
  const child = (el: Element | null | undefined, ns: keyof typeof UBL_NS, name: string): Element | null => {
    if (!el) return null
    for (const c of Array.from(el.children)) if (c.namespaceURI === UBL_NS[ns] && c.localName === name) return c
    return null
  }
  const path = (el: Element | null, ...steps: [keyof typeof UBL_NS, string][]): Element | null =>
    steps.reduce<Element | null>((cur, [ns, name]) => child(cur, ns, name), el)
  const text = (el: Element | null) => el?.textContent?.trim() ?? ''

  const currency = text(child(root, 'cbc', 'DocumentCurrencyCode'))
  if (!isSupportedCurrency(currency)) return null
  const supplier = path(root, ['cac', 'AccountingSupplierParty'], ['cac', 'Party'])
  const merchant =
    text(path(supplier, ['cac', 'PartyName'], ['cbc', 'Name'])) || text(path(supplier, ['cac', 'PartyLegalEntity'], ['cbc', 'RegistrationName']))
  const taxId = text(path(supplier, ['cac', 'PartyTaxScheme'], ['cbc', 'CompanyID']))
  const address = path(supplier, ['cac', 'PostalAddress'])
  const totals = child(root, 'cac', 'LegalMonetaryTotal')
  const taxTotal = child(root, 'cac', 'TaxTotal')
  const taxLines: TaxLine[] = taxTotal
    ? Array.from(taxTotal.children)
        .filter((c) => c.localName === 'TaxSubtotal')
        .map((sub) => ({
          label: `VAT ${text(path(sub, ['cac', 'TaxCategory'], ['cbc', 'ID']))}`.trim(),
          rate: text(path(sub, ['cac', 'TaxCategory'], ['cbc', 'Percent'])),
          amountMinor: decimalToMinor(text(child(sub, 'cbc', 'TaxAmount')), currency) ?? 0,
        }))
    : []
  const lines = Array.from(root.children)
    .filter((c) => c.localName === 'InvoiceLine' || c.localName === 'CreditNoteLine')
    .map((line) => ({
      description: text(path(line, ['cac', 'Item'], ['cbc', 'Name'])),
      quantity: text(child(line, 'cbc', 'InvoicedQuantity')) || text(child(line, 'cbc', 'CreditedQuantity')),
      unitPriceMinor: decimalToMinor(text(path(line, ['cac', 'Price'], ['cbc', 'PriceAmount'])), currency),
      totalMinor: decimalToMinor(text(child(line, 'cbc', 'LineExtensionAmount')), currency),
    }))
  const issue = text(child(root, 'cbc', 'IssueDate'))
  const due = text(child(root, 'cbc', 'DueDate'))
  return {
    format: 'ubl-xml',
    kind: 'tax-invoice',
    merchant,
    merchantTaxId: taxId,
    merchantAddress: [text(child(address, 'cbc', 'StreetName')), text(child(address, 'cbc', 'CityName'))].filter(Boolean).join(', '),
    invoiceNumber: text(child(root, 'cbc', 'ID')),
    issueDate: isValidIsoDate(issue) ? issue : null,
    dueDate: isValidIsoDate(due) ? due : null,
    currency,
    subtotalMinor: decimalToMinor(text(child(totals, 'cbc', 'TaxExclusiveAmount')) || text(child(totals, 'cbc', 'LineExtensionAmount')), currency),
    discountMinor: decimalToMinor(text(child(totals, 'cbc', 'AllowanceTotalAmount')), currency),
    taxMinor: taxTotal ? decimalToMinor(text(child(taxTotal, 'cbc', 'TaxAmount')), currency) : null,
    totalMinor: decimalToMinor(text(child(totals, 'cbc', 'PayableAmount')) || text(child(totals, 'cbc', 'TaxInclusiveAmount')), currency),
    taxLines,
    lines,
    uuid: '',
  }
}

/**
 * Saudi ZATCA simplified-invoice QR: base64 of TLV records — tag 1 seller name, 2 VAT number,
 * 3 timestamp, 4 invoice total (with VAT), 5 VAT total. Values are UTF-8 text.
 */
export function parseZatcaQr(payload: string): StructuredInvoice | null {
  let bytes: Uint8Array
  try {
    const binary = atob(payload.trim())
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  const fields = new Map<number, string>()
  const decoder = new TextDecoder()
  let i = 0
  while (i + 2 <= bytes.length) {
    const tag = bytes[i] ?? 0
    const length = bytes[i + 1] ?? 0
    const value = bytes.slice(i + 2, i + 2 + length)
    if (value.length !== length || tag === 0) return null
    fields.set(tag, decoder.decode(value))
    i += 2 + length
  }
  if (i !== bytes.length || !fields.has(1) || !fields.has(4)) return null
  const date = isoFromDateTime(fields.get(3))
  return {
    format: 'zatca-qr',
    kind: 'tax-invoice',
    merchant: fields.get(1) ?? '',
    merchantTaxId: fields.get(2) ?? '',
    merchantAddress: '',
    invoiceNumber: '',
    issueDate: date,
    dueDate: null,
    currency: 'SAR',
    subtotalMinor: null,
    discountMinor: null,
    taxMinor: decimalToMinor(fields.get(5), 'SAR'),
    totalMinor: decimalToMinor(fields.get(4), 'SAR'),
    taxLines: fields.has(5) ? [{ label: 'VAT', rate: '', amountMinor: decimalToMinor(fields.get(5), 'SAR') ?? 0 }] : [],
    lines: [],
    uuid: '',
  }
}

export interface QrInterpretation {
  kind: 'eta-link' | 'zatca' | 'url' | 'text'
  /** Link to an official portal page the user can open themselves (never fetched by SpendWise). */
  url: string | null
  uuid: string | null
  invoice: StructuredInvoice | null
}

/**
 * ETA e-receipt QR codes encode `{portal}/receipts/search/{UUID}/share/{DateTime}#Total:{Total},IssuerRIN:{RIN}`
 * (ETA Receipt Issuance FAQ). The values are read from the text only; nothing is fetched.
 */
function parseEtaReceiptQr(url: URL): StructuredInvoice | null {
  const match = /\/receipts\/search\/([^/]+)\/share\/([^/#?]+)/i.exec(url.pathname)
  if (!match) return null
  const fragment = decodeURIComponent(url.hash.replace(/^#/, ''))
  const total = /Total:([\d.]+)/i.exec(fragment)?.[1]
  const rin = /IssuerRIN:([A-Za-z0-9-]+)/i.exec(fragment)?.[1]
  return {
    format: 'eta-json',
    kind: 'e-receipt',
    merchant: '',
    merchantTaxId: rin ?? '',
    merchantAddress: '',
    invoiceNumber: '',
    issueDate: isoFromDateTime(decodeURIComponent(match[2] ?? '')),
    dueDate: null,
    currency: 'EGP',
    subtotalMinor: null,
    discountMinor: null,
    taxMinor: null,
    totalMinor: total ? decimalToMinor(total, 'EGP') : null,
    taxLines: [],
    lines: [],
    uuid: match[1] ?? '',
  }
}

/** Explains what a QR payload is, without contacting any service. */
export function interpretQr(payload: string): QrInterpretation {
  const text = payload.trim()
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      if (/(^|\.)eta\.gov\.eg$/i.test(url.hostname) || /\/receipts\/search\/[^/]+\/share\//i.test(url.pathname)) {
        const receipt = parseEtaReceiptQr(url)
        const uuid = receipt?.uuid || /[A-Z0-9]{20,}/i.exec(url.pathname)?.[0] || url.searchParams.get('uuid')
        return { kind: 'eta-link', url: url.href, uuid: uuid ?? null, invoice: receipt }
      }
      return { kind: 'url', url: url.href, uuid: null, invoice: null }
    } catch {
      return { kind: 'text', url: null, uuid: null, invoice: null }
    }
  }
  const zatca = /^[A-Za-z0-9+/]+={0,2}$/.test(text) ? parseZatcaQr(text) : null
  if (zatca) return { kind: 'zatca', url: null, uuid: null, invoice: zatca }
  return { kind: 'text', url: null, uuid: null, invoice: null }
}
