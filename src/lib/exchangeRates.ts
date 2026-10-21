import { minorUnitDigits } from '@/domain/currencies'

/**
 * Exchange rates from the Frankfurter API (https://frankfurter.dev), which republishes the
 * European Central Bank's euro foreign exchange reference rates. No API key is required and
 * requests contain only currency codes. Rates are published once per working day (around
 * 16:00 CET), so they are reference rates, not live market prices.
 */
export const RATE_SOURCE = {
  name: 'Frankfurter',
  url: 'https://frankfurter.dev',
  description: 'European Central Bank reference rates, published on working days',
} as const

export const FRANKFURTER_ENDPOINT = 'https://api.frankfurter.dev/v1/latest'

/** Currencies Frankfurter supports (verified against https://api.frankfurter.dev/v1/currencies). */
export const SUPPORTED_RATE_CURRENCIES: ReadonlySet<string> = new Set([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
])

export function isRateSupported(currency: string): boolean {
  return SUPPORTED_RATE_CURRENCIES.has(currency)
}

export interface RateTable {
  /** Currency the rates are quoted against: 1 base = rate × target. */
  base: string
  /** Publication date of the reference rates (YYYY-MM-DD). */
  date: string
  rates: Record<string, number>
  /** When SpendWise last fetched these rates successfully (ISO timestamp). */
  fetchedAt: string
}

export type RateErrorKind = 'unsupported' | 'timeout' | 'rate-limited' | 'network' | 'http' | 'invalid-response'

export class RateError extends Error {
  readonly kind: RateErrorKind
  constructor(kind: RateErrorKind, message: string) {
    super(message)
    this.name = 'RateError'
    this.kind = kind
  }
}

export const RATE_TIMEOUT_MS = 8000

interface FetchOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => Date
}

/** Fetches the latest reference rates for `base` → `targets`. Throws RateError on any failure. */
export async function fetchRates(base: string, targets: readonly string[], options: FetchOptions = {}): Promise<RateTable> {
  const { fetchImpl = fetch, timeoutMs = RATE_TIMEOUT_MS, now = () => new Date() } = options
  if (!isRateSupported(base)) throw new RateError('unsupported', `${base} isn’t covered by the exchange-rate source.`)
  const symbols = [...new Set(targets.filter((t) => t !== base && isRateSupported(t)))]
  if (symbols.length === 0) return { base, date: '', rates: {}, fetchedAt: now().toISOString() }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchImpl(`${FRANKFURTER_ENDPOINT}?base=${encodeURIComponent(base)}&symbols=${symbols.map(encodeURIComponent).join(',')}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (controller.signal.aborted) throw new RateError('timeout', 'The exchange-rate service took too long to respond.')
    throw new RateError('network', error instanceof Error ? 'The exchange-rate service couldn’t be reached.' : 'Network error.')
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 429) throw new RateError('rate-limited', 'The exchange-rate service is limiting requests. Try again later.')
  if (response.status === 404 || response.status === 422) throw new RateError('unsupported', 'One of these currencies isn’t covered by the exchange-rate source.')
  if (!response.ok) throw new RateError('http', `The exchange-rate service returned an error (${response.status}).`)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new RateError('invalid-response', 'The exchange-rate service returned an unreadable response.')
  }
  const parsed = body as { base?: unknown; date?: unknown; rates?: unknown }
  if (
    parsed.base !== base ||
    typeof parsed.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ||
    typeof parsed.rates !== 'object' ||
    parsed.rates === null
  ) {
    throw new RateError('invalid-response', 'The exchange-rate service returned unexpected data.')
  }
  const rates: Record<string, number> = {}
  for (const [code, value] of Object.entries(parsed.rates as Record<string, unknown>)) {
    if (symbols.includes(code) && typeof value === 'number' && Number.isFinite(value) && value > 0) rates[code] = value
  }
  return { base, date: parsed.date, rates, fetchedAt: now().toISOString() }
}

// ---------------------------------------------------------------------------
// Cache (per device). Rates are reference data, not personal data.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'spendwise.fx.v1.'

export function readCachedRates(base: string): RateTable | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + base)
    if (!raw) return null
    const table = JSON.parse(raw) as RateTable
    return table.base === base && typeof table.fetchedAt === 'string' && typeof table.rates === 'object' ? table : null
  } catch {
    return null
  }
}

export function writeCachedRates(table: RateTable): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + table.base, JSON.stringify(table))
  } catch {
    // Without storage the rates simply aren't cached.
  }
}

/** Refetch after this long, even if the cached table looks current. */
export const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000
/** A rate publication older than this (e.g. long holidays or a failing source) is flagged as stale. */
export const STALE_AFTER_DAYS = 4

export function isRateTableStale(table: RateTable, now: Date = new Date()): boolean {
  if (!table.date) return false
  const published = new Date(`${table.date}T16:00:00Z`).getTime()
  return now.getTime() - published > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

export function needsRefresh(table: RateTable | null, targets: readonly string[], now: Date = new Date()): boolean {
  if (!table) return true
  if (now.getTime() - new Date(table.fetchedAt).getTime() > REFRESH_AFTER_MS) return true
  return targets.some((t) => t !== table.base && isRateSupported(t) && !(t in table.rates))
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

const RATE_SCALE = 10n ** 10n

/**
 * Converts an amount in `from` minor units to `to` minor units using `rate` (1 to = rate × from,
 * i.e. the table is based on the target currency). Uses integer arithmetic and rounds half away
 * from zero, so results are reproducible. Display-only: stored amounts are never changed.
 */
export function convertMinor(amountMinor: number, from: string, to: string, unitsOfFromPerTo: number): number {
  if (from === to) return amountMinor
  if (!(unitsOfFromPerTo > 0) || !Number.isFinite(unitsOfFromPerTo)) throw new RangeError('Invalid exchange rate.')
  const fromDigits = minorUnitDigits(from)
  const toDigits = minorUnitDigits(to)
  const scaledRate = BigInt(Math.round(unitsOfFromPerTo * Number(RATE_SCALE)))
  const negative = amountMinor < 0
  const numerator = BigInt(Math.abs(amountMinor)) * RATE_SCALE * 10n ** BigInt(toDigits)
  const denominator = scaledRate * 10n ** BigInt(fromDigits)
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
  const result = Number(rounded)
  return negative ? -result : result
}

export interface ConvertedLine {
  currency: string
  amountMinor: number
  /** How many units of `currency` equal one unit of the target, or null when unavailable. */
  rate: number | null
  convertedMinor: number | null
}

/** Converts per-currency amounts into `target` using a table based on `target`. */
export function convertTotals(
  amounts: readonly { currency: string; amountMinor: number }[],
  target: string,
  table: RateTable | null,
): { lines: ConvertedLine[]; totalMinor: number; complete: boolean } {
  let totalMinor = 0
  let complete = true
  const lines = amounts.map(({ currency, amountMinor }) => {
    if (currency === target) {
      totalMinor += amountMinor
      return { currency, amountMinor, rate: 1, convertedMinor: amountMinor }
    }
    const rate = table && table.base === target ? table.rates[currency] : undefined
    if (!rate) {
      complete = false
      return { currency, amountMinor, rate: null, convertedMinor: null }
    }
    const convertedMinor = convertMinor(amountMinor, currency, target, rate)
    totalMinor += convertedMinor
    return { currency, amountMinor, rate, convertedMinor }
  })
  return { lines, totalMinor, complete }
}
