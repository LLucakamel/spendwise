import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import type { DateFormatPreference, IsoDate, IsoMonth, WeekStart } from '@/domain/types'

export interface DateRange {
  /** Inclusive start date. */
  from: IsoDate
  /** Inclusive end date. */
  to: IsoDate
}

export const PERIOD_PRESETS = ['this-month', 'last-month', 'last-30-days', 'last-90-days', 'this-year', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30-days': 'Last 30 days',
  'last-90-days': 'Last 90 days',
  'this-year': 'This year',
  custom: 'Custom range',
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_MONTH = /^(\d{4})-(\d{2})$/

/** Local calendar date → `YYYY-MM-DD`. */
export function toIsoDate(date: Date): IsoDate {
  return format(date, 'yyyy-MM-dd')
}

/** `YYYY-MM-DD` → Date at local midnight. */
export function fromIsoDate(value: IsoDate): Date {
  const match = ISO_DATE.exec(value)
  if (!match) throw new Error(`Invalid ISO date: ${value}`)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false
  return day <= getDaysInMonth(new Date(year, month - 1, 1))
}

export function isValidIsoMonth(value: string): boolean {
  const match = ISO_MONTH.exec(value)
  if (!match) return false
  const month = Number(match[2])
  const year = Number(match[1])
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2200
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now)
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7)
}

export function monthRange(month: IsoMonth): DateRange {
  const start = fromIsoDate(`${month}-01`)
  return { from: toIsoDate(start), to: toIsoDate(endOfMonth(start)) }
}

export function addMonthsToMonth(month: IsoMonth, amount: number): IsoMonth {
  return format(addMonths(fromIsoDate(`${month}-01`), amount), 'yyyy-MM')
}

export function isInRange(date: IsoDate, range: DateRange): boolean {
  return date >= range.from && date <= range.to
}

export function rangeLengthDays(range: DateRange): number {
  return differenceInCalendarDays(fromIsoDate(range.to), fromIsoDate(range.from)) + 1
}

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: IsoDate): DateRange {
  const now = fromIsoDate(today)
  switch (preset) {
    case 'this-month':
      return { from: toIsoDate(startOfMonth(now)), to: toIsoDate(endOfMonth(now)) }
    case 'last-month': {
      const last = subMonths(startOfMonth(now), 1)
      return { from: toIsoDate(last), to: toIsoDate(endOfMonth(last)) }
    }
    case 'last-30-days':
      return { from: toIsoDate(addDays(now, -29)), to: today }
    case 'last-90-days':
      return { from: toIsoDate(addDays(now, -89)), to: today }
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
  }
}

/**
 * The period a selection is compared against.
 * In-progress calendar periods (this month, this year) are compared with the same
 * elapsed portion of the previous period, so a half-finished month is not compared
 * with a whole one.
 */
export function comparisonRange(preset: PeriodPreset, range: DateRange, today: IsoDate): DateRange {
  const from = fromIsoDate(range.from)
  if (preset === 'this-month' || preset === 'last-month') {
    const previousStart = subMonths(from, 1)
    const previousEnd = endOfMonth(previousStart)
    if (preset === 'this-month' && isInRange(today, range)) {
      const elapsed = Number(today.slice(8, 10))
      const day = Math.min(elapsed, getDaysInMonth(previousStart))
      return { from: toIsoDate(previousStart), to: toIsoDate(addDays(previousStart, day - 1)) }
    }
    return { from: toIsoDate(previousStart), to: toIsoDate(previousEnd) }
  }
  if (preset === 'this-year') {
    const year = Number(range.from.slice(0, 4)) - 1
    const previous: DateRange = { from: `${year}-01-01`, to: `${year}-12-31` }
    if (isInRange(today, range)) {
      const sameDay = `${year}-${today.slice(5)}`
      previous.to = isValidIsoDate(sameDay) ? sameDay : `${year}-02-28`
    }
    return previous
  }
  const length = rangeLengthDays(range)
  return { from: toIsoDate(addDays(from, -length)), to: toIsoDate(addDays(from, -1)) }
}

export type Granularity = 'day' | 'week' | 'month'

export function chooseGranularity(range: DateRange): Granularity {
  const days = rangeLengthDays(range)
  if (days <= 14) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}

export function bucketStart(date: IsoDate, granularity: Granularity, weekStartsOn: WeekStart): IsoDate {
  if (granularity === 'day') return date
  if (granularity === 'month') return `${date.slice(0, 7)}-01`
  return toIsoDate(startOfWeek(fromIsoDate(date), { weekStartsOn }))
}

export function eachBucket(range: DateRange, granularity: Granularity, weekStartsOn: WeekStart): IsoDate[] {
  const buckets: IsoDate[] = []
  let cursor = bucketStart(range.from, granularity, weekStartsOn)
  const guard = 2000
  while (cursor <= range.to && buckets.length < guard) {
    buckets.push(cursor)
    const date = fromIsoDate(cursor)
    cursor = toIsoDate(
      granularity === 'day' ? addDays(date, 1) : granularity === 'week' ? addDays(date, 7) : addMonths(date, 1),
    )
  }
  return buckets
}

const PATTERNS: Record<Exclude<DateFormatPreference, 'locale'>, string> = {
  'yyyy-MM-dd': 'yyyy-MM-dd',
  'dd/MM/yyyy': 'dd/MM/yyyy',
  'MM/dd/yyyy': 'MM/dd/yyyy',
  'd MMM yyyy': 'd MMM yyyy',
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

function localeFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = dateFormatterCache.get(key)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, options)
    } catch {
      formatter = new Intl.DateTimeFormat('en-US', options)
    }
    dateFormatterCache.set(key, formatter)
  }
  return formatter
}

export function formatDate(date: IsoDate, preference: DateFormatPreference, locale: string): string {
  if (!isValidIsoDate(date)) return date
  const value = fromIsoDate(date)
  if (preference === 'locale') return localeFormatter(locale, { dateStyle: 'medium' }).format(value)
  return format(value, PATTERNS[preference])
}

export function formatRange(range: DateRange, preference: DateFormatPreference, locale: string): string {
  if (range.from === range.to) return formatDate(range.from, preference, locale)
  return `${formatDate(range.from, preference, locale)} – ${formatDate(range.to, preference, locale)}`
}

export function formatMonth(month: IsoMonth, locale: string): string {
  return localeFormatter(locale, { month: 'long', year: 'numeric' }).format(fromIsoDate(`${month}-01`))
}

export function formatBucketLabel(bucket: IsoDate, granularity: Granularity, locale: string): string {
  const date = fromIsoDate(bucket)
  if (granularity === 'month') return localeFormatter(locale, { month: 'short', year: '2-digit' }).format(date)
  return localeFormatter(locale, { month: 'short', day: 'numeric' }).format(date)
}

/** Converts a stored ISO timestamp to a readable local date-time. */
export function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return localeFormatter(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
