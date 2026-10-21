import { minorUnitDigits } from '@/domain/currencies'
import type { IsoDate } from '@/domain/types'
import { isValidIsoDate } from './dates'

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹'

/** Converts Arabic-Indic digits and Arabic separators to ASCII ("١٬٢٣٤٫٥" → "1,234.5"). */
export function normalizeDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const a = ARABIC_INDIC.indexOf(ch)
    const e = EXTENDED_ARABIC_INDIC.indexOf(ch)
    if (a >= 0) out += String(a)
    else if (e >= 0) out += String(e)
    else if (ch === '٫') out += '.'
    else if (ch === '٬' || ch === '،') out += ','
    else out += ch
  }
  return out
}

/**
 * Parses an amount as printed on a document (any of "1,234.56", "1.234,56", "1 234,56",
 * "١٬٢٣٤٫٥٦", "EGP 45.00") into integer minor units of `currency`, without floating point.
 * Returns null when the text is not an unambiguous amount.
 */
export function parseLocalizedAmount(raw: string, currency: string): number | null {
  const digits = minorUnitDigits(currency)
  let s = normalizeDigits(raw).replace(/[\s\u00a0\u202f]/g, '').replace(/[^\d.,-]/g, '')
  if (!/\d/.test(s)) return null
  const negative = s.startsWith('-')
  s = s.replace(/-/g, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let whole: string
  let fraction = ''
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the later one is the decimal separator.
    const decimal = lastDot > lastComma ? '.' : ','
    const [w = '', f = ''] = splitLast(s, decimal)
    whole = w.replace(/[.,]/g, '')
    fraction = f
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = s.split(sep)
    const tail = parts[parts.length - 1] ?? ''
    // "1,234" or "1.234.567" with 3-digit groups are thousands separators; otherwise a decimal part.
    if (parts.length > 2 || (tail.length === 3 && digits !== 3 && parts[0] !== '0')) {
      whole = parts.join('')
    } else {
      whole = parts.slice(0, -1).join('')
      fraction = tail
    }
  } else {
    whole = s
  }
  if (!/^\d+$/.test(whole || '0') || !/^\d*$/.test(fraction)) return null
  if (fraction.length > digits) {
    // Round half up on the extra digits (documents sometimes print more precision).
    const keep = fraction.slice(0, digits)
    const next = Number(fraction[digits])
    const base = Number((whole || '0') + keep.padEnd(digits, '0'))
    const value = next >= 5 ? base + 1 : base
    return Number.isSafeInteger(value) ? (negative ? -value : value) : null
  }
  const value = Number((whole || '0') + fraction.padEnd(digits, '0'))
  if (!Number.isSafeInteger(value)) return null
  return negative ? -value : value
}

function splitLast(s: string, sep: string): [string, string] {
  const i = s.lastIndexOf(sep)
  return [s.slice(0, i), s.slice(i + 1)]
}

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const AR_MONTHS: [RegExp, number][] = [
  [/يناير/, 1], [/فبراير/, 2], [/مارس/, 3], [/[أا]بريل/, 4], [/مايو/, 5], [/يونيو/, 6],
  [/يوليو/, 7], [/[أا]غسطس/, 8], [/سبتمبر/, 9], [/[أا]كتوبر/, 10], [/نوفمبر/, 11], [/ديسمبر/, 12],
]

export type DateOrder = 'dmy' | 'mdy'

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, m: number, d: number): IsoDate | null => {
  const year = y < 100 ? 2000 + y : y
  const iso = `${year}-${pad(m)}-${pad(d)}`
  return isValidIsoDate(iso) ? iso : null
}

/**
 * Finds the first plausible date in a piece of text. Numeric dates are read day-first unless
 * `order` is "mdy" (US documents); ISO dates and month names are unambiguous.
 */
export function parseDocumentDate(raw: string, order: DateOrder = 'dmy'): IsoDate | null {
  const s = normalizeDigits(raw)
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s)
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(s)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const y = Number(m[3])
    // If one part can only be a day (> 12), the order is unambiguous.
    if (a > 12) return toIso(y, b, a)
    if (b > 12) return toIso(y, a, b)
    return order === 'mdy' ? toIso(y, a, b) : toIso(y, b, a)
  }
  m = /\b(\d{1,2})\s*([A-Za-z]{3,9})\.?,?\s*(\d{4})\b/.exec(s)
  if (m) {
    const month = EN_MONTHS.indexOf((m[2] ?? '').slice(0, 3).toLowerCase())
    if (month >= 0) return toIso(Number(m[3]), month + 1, Number(m[1]))
  }
  m = /\b([A-Za-z]{3,9})\.?\s*(\d{1,2}),?\s*(\d{4})\b/.exec(s)
  if (m) {
    const month = EN_MONTHS.indexOf((m[1] ?? '').slice(0, 3).toLowerCase())
    if (month >= 0) return toIso(Number(m[3]), month + 1, Number(m[2]))
  }
  for (const [pattern, month] of AR_MONTHS) {
    const am = new RegExp(`(\\d{1,2})\\s*${pattern.source}\\s*(\\d{4})`).exec(s)
    if (am) return toIso(Number(am[2]), month, Number(am[1]))
  }
  return null
}
