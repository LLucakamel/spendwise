import { minorUnitDigits } from '@/domain/currencies'
import { normalizeDigits } from './text'

/**
 * Validation errors are translation keys, optionally followed by "|" and JSON parameters,
 * e.g. `validation.amountDecimals|{"currency":"USD","digits":2}`. The UI translates them.
 */
export type ParseResult = { ok: true; value: number } | { ok: false; error: string }

export const errorKey = (key: string, params?: Record<string, string | number>) => (params ? `${key}|${JSON.stringify(params)}` : key)

/** Largest amount accepted for a single entry, in minor units. Keeps all sums far below 2^53. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000

/**
 * Parses a user-entered decimal amount into integer minor units without floating-point arithmetic.
 * Accepts `.` or `,` as the decimal separator; grouping separators are rejected to avoid ambiguity.
 */
export function parseAmountToMinor(input: string, currency: string): ParseResult {
  const digits = minorUnitDigits(currency)
  const trimmed = normalizeDigits(input).trim().replace(/[\s_]/g, '')
  if (trimmed === '') return { ok: false, error: errorKey('validation.amountRequired') }
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(trimmed)
  if (!match) return { ok: false, error: errorKey('validation.amountFormat') }
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > digits) {
    return {
      ok: false,
      error: digits === 0 ? errorKey('validation.amountNoDecimals', { currency }) : errorKey('validation.amountDecimals', { currency, digits }),
    }
  }
  const normalized = (whole + fraction.padEnd(digits, '0')).replace(/^0+(?=\d)/, '')
  if (normalized.length > 16) return { ok: false, error: errorKey('validation.amountTooLarge') }
  const value = Number(normalized)
  if (!Number.isSafeInteger(value) || value > MAX_AMOUNT_MINOR) return { ok: false, error: errorKey('validation.amountTooLarge') }
  if (value <= 0) return { ok: false, error: errorKey('validation.amountPositive') }
  return { ok: true, value }
}

/** Like parseAmountToMinor but allows zero and a leading minus sign (used for opening balances). */
export function parseSignedAmountToMinor(input: string, currency: string): ParseResult {
  const trimmed = input.trim()
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed
  if (body !== '' && /^0*(?:[.,]0*)?$/.test(body)) return { ok: true, value: 0 }
  const parsed = parseAmountToMinor(body, currency)
  if (!parsed.ok) return parsed
  return { ok: true, value: negative ? -parsed.value : parsed.value }
}

/** Exact decimal string for an integer minor-unit amount, e.g. (-1234, 'USD') → "-12.34". */
export function minorToDecimalString(minor: number, currency: string): string {
  assertSafeInteger(minor)
  const digits = minorUnitDigits(currency)
  const negative = minor < 0
  const abs = String(Math.abs(minor))
  if (digits === 0) return (negative ? '-' : '') + abs
  const padded = abs.padStart(digits + 1, '0')
  const whole = padded.slice(0, -digits)
  const fraction = padded.slice(-digits)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** Approximate numeric value for chart geometry only. Never used for totals. */
export function minorToNumber(minor: number, currency: string): number {
  return minor / 10 ** minorUnitDigits(currency)
}

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(locale: string, currency: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${currency}|${JSON.stringify(options)}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, { style: 'currency', currency, ...options })
    } catch {
      formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, ...options })
    }
    formatterCache.set(key, formatter)
  }
  return formatter
}

export interface FormatMoneyOptions {
  signDisplay?: Intl.NumberFormatOptions['signDisplay']
  compact?: boolean
}

/** Locale-aware currency formatting from the exact decimal value (no float rounding). */
export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
  options: FormatMoneyOptions = {},
): string {
  const signDisplay = options.signDisplay ?? 'auto'
  if (options.compact) {
    return getFormatter(locale, currency, { notation: 'compact', maximumFractionDigits: 1, signDisplay }).format(
      minorToNumber(minor, currency),
    )
  }
  const digits = minorUnitDigits(currency)
  const formatter = getFormatter(locale, currency, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay,
  })
  return formatter.format(minorToDecimalString(minor, currency) as Intl.StringNumericLiteral)
}

/** Compact label for a chart axis tick, where the value is already in major units. */
export function formatAxisValue(value: number, currency: string, locale: string): string {
  return getFormatter(locale, currency, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function assertSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Monetary value is not a safe integer: ${value}`)
}

/** Integer addition with overflow protection. */
export function addMinor(a: number, b: number): number {
  const result = a + b
  assertSafeInteger(result)
  return result
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0
  for (const value of values) total = addMinor(total, value)
  return total
}

/** Percentage of part over whole, or null when whole is zero. Display-only. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null
  return (part / whole) * 100
}
