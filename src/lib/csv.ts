import type { Transaction } from '@/domain/types'
import { minorToDecimalString } from './money'

/** UTF-8 byte order mark, so spreadsheet apps detect the encoding. */
const BOM = String.fromCharCode(0xfeff)

const FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * Escapes one CSV field per RFC 4180. Text fields that a spreadsheet would interpret as a
 * formula are prefixed with an apostrophe to prevent CSV injection.
 */
export function escapeCsvField(value: string | number | null | undefined, options: { text?: boolean } = {}): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (options.text !== false && typeof value === 'string' && FORMULA_PREFIX.test(str)) str = `'${str}`
  if (/[",\r\n]/.test(str) || /^\s|\s$/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv(rows: readonly (readonly (string | number | null)[])[], header: readonly string[]): string {
  const lines = [header.map((h) => escapeCsvField(h)).join(',')]
  for (const row of rows) lines.push(row.map((cell) => escapeCsvField(cell)).join(','))
  return lines.join('\r\n') + '\r\n'
}

export const TRANSACTION_CSV_HEADER = [
  'Date',
  'Type',
  'Description',
  'Category',
  'Amount',
  'Currency',
  'Account',
  'To account',
  'Payment method',
  'Reference',
  'Source',
  'Reconciled',
  'Notes',
  'ID',
  'Created at',
  'Updated at',
] as const

export interface CsvNames {
  category(id: string): string
  account(id: string | null): string
}

/** Exports transactions; amounts are exact decimal strings in each transaction's own currency. */
export function transactionsToCsv(transactions: readonly Transaction[], names: CsvNames): string {
  const rows = transactions.map((t) => [
    t.date,
    t.type,
    t.description,
    t.type === 'transfer' ? '' : names.category(t.categoryId),
    minorToDecimalString(t.amountMinor, t.currency),
    t.currency,
    t.accountId ? names.account(t.accountId) : '',
    t.toAccountId ? names.account(t.toAccountId) : '',
    t.paymentMethod ?? '',
    t.sourceRef ?? '',
    t.origin,
    t.reconciled ? 'yes' : 'no',
    t.notes,
    t.id,
    t.createdAt,
    t.updatedAt,
  ])
  return toCsv(rows, TRANSACTION_CSV_HEADER)
}

/** Generic CSV export for other record lists (income, invoices). */
export function recordsToCsv(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return toCsv(rows, header)
}

/** Triggers a browser download. A UTF-8 BOM is added so spreadsheet apps detect the encoding. */
export function downloadTextFile(filename: string, content: string, mime: string, withBom = false): void {
  const blob = new Blob([withBom ? BOM : '', content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
