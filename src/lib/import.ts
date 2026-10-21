import type { IsoDate, Transaction, TransactionType } from '@/domain/types'
import { normalizeDigits, parseDocumentDate, parseLocalizedAmount, type DateOrder } from './text'

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF). Detects `,` `;` or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\ufeff/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

export interface ColumnMapping {
  date: number | null
  description: number | null
  /** Either one signed amount column… */
  amount: number | null
  /** …or separate debit (money out) and credit (money in) columns. */
  debit: number | null
  credit: number | null
  currency: number | null
  reference: number | null
}

const HEADER_HINTS: Record<keyof ColumnMapping, RegExp> = {
  date: /^(date|transaction date|posting date|value date|booking date|التاريخ|تاريخ العملية|تاريخ الحركة|تاريخ القيد)$/i,
  description: /(description|details|narrative|memo|payee|name|merchant|البيان|الوصف|التفاصيل|بيان العملية)/i,
  amount: /^(amount|net|value|المبلغ|القيمة)$/i,
  debit: /(debit|withdrawal|money out|paid out|مدين|سحب|خصم)/i,
  credit: /(credit|deposit|money in|paid in|دائن|إيداع|ايداع)/i,
  currency: /(currency|ccy|العملة)/i,
  reference: /(reference|ref\.?|transaction id|receipt|المرجع|رقم المرجع|رقم العملية)/i,
}

/** Suggests a column mapping from the header row; the user reviews and adjusts it. */
export function guessMapping(header: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = { date: null, description: null, amount: null, debit: null, credit: null, currency: null, reference: null }
  header.forEach((raw, index) => {
    const name = raw.trim()
    for (const key of Object.keys(HEADER_HINTS) as (keyof ColumnMapping)[]) {
      if (mapping[key] === null && HEADER_HINTS[key].test(name)) {
        mapping[key] = index
        break
      }
    }
  })
  return mapping
}

export interface ImportRow {
  index: number
  date: IsoDate | null
  description: string
  type: Extract<TransactionType, 'income' | 'expense'> | null
  amountMinor: number | null
  currency: string
  reference: string
  /** Stable key derived from the row content; re-importing the same row yields the same key. */
  key: string
  errors: ('date' | 'amount' | 'description' | 'currency')[]
}

/** FNV-1a 32-bit hash, enough to derive stable document IDs for import rows. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function interpretRows(
  rows: readonly string[][],
  mapping: ColumnMapping,
  options: { currency: string; dateOrder: DateOrder; accountId: string | null; isSupportedCurrency(code: string): boolean },
): ImportRow[] {
  const cell = (row: readonly string[], i: number | null) => (i === null ? '' : (row[i] ?? '').trim())
  // Occurrence counter so two identical rows on the same day (e.g. two coffees) stay distinct.
  const seen = new Map<string, number>()
  return rows.map((row, index) => {
    const errors: ImportRow['errors'] = []
    const currencyCell = cell(row, mapping.currency).toUpperCase()
    const currency = currencyCell && options.isSupportedCurrency(currencyCell) ? currencyCell : options.currency
    if (currencyCell && !options.isSupportedCurrency(currencyCell)) errors.push('currency')
    const date = parseDocumentDate(cell(row, mapping.date), options.dateOrder)
    if (!date) errors.push('date')
    const description = cell(row, mapping.description).replace(/\s+/g, ' ')
    if (!description) errors.push('description')

    let signed: number | null = null
    if (mapping.amount !== null) {
      const raw = normalizeDigits(cell(row, mapping.amount))
      const value = parseLocalizedAmount(raw.replace(/[()]/g, ''), currency)
      // "(12.00)" and trailing "-" are common negative notations in statements.
      const negative = /^\s*-|\(.*\)|-\s*$|\bDR\b|مدين/i.test(raw)
      signed = value === null ? null : negative && value > 0 ? -value : value
    } else {
      const debit = parseLocalizedAmount(cell(row, mapping.debit), currency)
      const credit = parseLocalizedAmount(cell(row, mapping.credit), currency)
      if (debit && debit !== 0) signed = -Math.abs(debit)
      else if (credit && credit !== 0) signed = Math.abs(credit)
    }
    if (signed === null || signed === 0) errors.push('amount')
    const reference = cell(row, mapping.reference)
    const base = reference ? `${options.accountId ?? '-'}|ref|${reference}` : `${options.accountId ?? '-'}|${date}|${signed}|${description.toLocaleLowerCase()}`
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    return {
      index,
      date,
      description,
      type: signed === null || signed === 0 ? null : signed > 0 ? 'income' : 'expense',
      amountMinor: signed === null ? null : Math.abs(signed),
      currency,
      reference,
      key: `${fnv1a(base)}${occurrence > 1 ? `-${occurrence}` : ''}`,
      errors,
    }
  })
}

/** Deterministic transaction ID for an import row: importing the same file twice updates nothing new. */
export function importTransactionId(accountId: string | null, key: string): string {
  return `imp_${accountId ?? 'none'}_${key}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128)
}

export type DuplicateKind = 'already-imported' | 'possible-duplicate'

/** Flags rows that were imported before (same ID) or look like an existing manual entry. */
export function classifyDuplicates(rows: readonly ImportRow[], accountId: string | null, existing: readonly Transaction[]): Map<number, DuplicateKind> {
  const ids = new Set(existing.map((t) => t.id))
  const result = new Map<number, DuplicateKind>()
  for (const row of rows) {
    if (ids.has(importTransactionId(accountId, row.key))) {
      result.set(row.index, 'already-imported')
      continue
    }
    if (row.date && row.amountMinor !== null) {
      const match = existing.find(
        (t) =>
          t.date === row.date &&
          t.amountMinor === row.amountMinor &&
          t.currency === row.currency &&
          (t.type === row.type || t.type === 'transfer') &&
          (accountId === null || t.accountId === accountId || t.toAccountId === accountId),
      )
      if (match) result.set(row.index, 'possible-duplicate')
    }
  }
  return result
}

/**
 * Extracts candidate transaction lines from a text-based PDF statement: lines that start with a date
 * and end with an amount. Layouts vary by bank, so every row is shown for review before import.
 */
export function rowsFromStatementText(text: string): string[][] {
  const rows: string[][] = [['Date', 'Description', 'Amount']]
  for (const raw of text.split('\n')) {
    const line = normalizeDigits(raw).trim()
    const date = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(line)
    if (!date) continue
    const amount = /(-?\(?[\d.,]+\)?\s*(?:CR|DR|-)?)$/.exec(date[2] ?? '')
    if (!amount?.[1] || !/\d/.test(amount[1])) continue
    const description = (date[2] ?? '').slice(0, -amount[1].length).trim()
    rows.push([date[1] ?? '', description, amount[1].trim()])
  }
  return rows
}
