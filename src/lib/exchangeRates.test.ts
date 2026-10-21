import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  convertMinor,
  convertTotals,
  fetchRates,
  isRateSupported,
  isRateTableStale,
  needsRefresh,
  RateError,
  readCachedRates,
  writeCachedRates,
  type RateTable,
} from './exchangeRates'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.useRealTimers()
})

describe('convertMinor', () => {
  it('divides by the quoted rate using integer arithmetic', () => {
    // Table based on USD: 1 USD = 0.89166 EUR. €100.00 → $112.15 (100 / 0.89166 = 112.1504...)
    expect(convertMinor(10000, 'EUR', 'USD', 0.89166)).toBe(11215)
    // 1 USD = 158.13 JPY. ¥1,280 → $8.09 (1280 / 158.13 = 8.0946...)
    expect(convertMinor(1280, 'JPY', 'USD', 158.13)).toBe(809)
    // To a zero-decimal currency: 1 JPY = 0.006324 USD → $10.00 = ¥1,581 (10 / 0.006324 = 1581.27)
    expect(convertMinor(1000, 'USD', 'JPY', 0.006324)).toBe(1581)
  })

  it('rounds half away from zero and keeps the sign', () => {
    expect(convertMinor(1, 'EUR', 'USD', 2)).toBe(1) // 0.5 cent → 1
    expect(convertMinor(-10000, 'EUR', 'USD', 0.89166)).toBe(-11215)
    expect(convertMinor(5000, 'USD', 'USD', 1)).toBe(5000)
  })

  it('rejects invalid rates', () => {
    expect(() => convertMinor(100, 'EUR', 'USD', 0)).toThrow(RangeError)
    expect(() => convertMinor(100, 'EUR', 'USD', Number.NaN)).toThrow(RangeError)
  })
})

describe('convertTotals', () => {
  const table: RateTable = { base: 'USD', date: '2026-10-20', rates: { EUR: 0.89166, JPY: 158.13 }, fetchedAt: '2026-10-21T08:00:00Z' }

  it('converts each currency and reports the rate used', () => {
    const result = convertTotals(
      [
        { currency: 'USD', amountMinor: 10000 },
        { currency: 'EUR', amountMinor: 10000 },
      ],
      'USD',
      table,
    )
    expect(result.lines).toEqual([
      { currency: 'USD', amountMinor: 10000, rate: 1, convertedMinor: 10000 },
      { currency: 'EUR', amountMinor: 10000, rate: 0.89166, convertedMinor: 11215 },
    ])
    expect(result.totalMinor).toBe(21215)
    expect(result.complete).toBe(true)
  })

  it('marks the total partial when a rate is missing instead of inventing one', () => {
    const result = convertTotals([{ currency: 'AED', amountMinor: 5000 }, { currency: 'USD', amountMinor: 100 }], 'USD', table)
    expect(result.lines[0]).toEqual({ currency: 'AED', amountMinor: 5000, rate: null, convertedMinor: null })
    expect(result.totalMinor).toBe(100)
    expect(result.complete).toBe(false)
  })

  it('never uses a table based on another currency', () => {
    expect(convertTotals([{ currency: 'EUR', amountMinor: 100 }], 'GBP', table).complete).toBe(false)
  })
})

describe('fetchRates', () => {
  it('requests only supported symbols and parses the response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ amount: 1, base: 'USD', date: '2026-10-20', rates: { EUR: 0.89166, GBP: 0.74925 } }))
    const table = await fetchRates('USD', ['EUR', 'GBP', 'AED', 'USD'], { fetchImpl, now: () => new Date('2026-10-21T10:00:00Z') })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = String((fetchImpl.mock.calls[0] as unknown as [string])[0])
    expect(url).toBe('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP')
    expect(table).toEqual({ base: 'USD', date: '2026-10-20', rates: { EUR: 0.89166, GBP: 0.74925 }, fetchedAt: '2026-10-21T10:00:00.000Z' })
  })

  it('refuses unsupported base currencies without a request', async () => {
    const fetchImpl = vi.fn()
    await expect(fetchRates('AED', ['USD'], { fetchImpl })).rejects.toMatchObject({ kind: 'unsupported' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    [429, 'rate-limited'],
    [404, 'unsupported'],
    [500, 'http'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'error' }, status))
    await expect(fetchRates('USD', ['EUR'], { fetchImpl })).rejects.toMatchObject({ kind })
  })

  it('rejects malformed or mismatched data', async () => {
    const wrongBase = vi.fn(async () => jsonResponse({ base: 'EUR', date: '2026-10-20', rates: { USD: 1.1 } }))
    await expect(fetchRates('USD', ['EUR'], { fetchImpl: wrongBase })).rejects.toMatchObject({ kind: 'invalid-response' })
    const notJson = vi.fn(async () => new Response('<html>', { status: 200 }))
    await expect(fetchRates('USD', ['EUR'], { fetchImpl: notJson })).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('reports network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchRates('USD', ['EUR'], { fetchImpl })).rejects.toMatchObject({ kind: 'network' })
  })

  it('times out slow responses', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const error = await fetchRates('USD', ['EUR'], { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateError)
    expect((error as RateError).kind).toBe('timeout')
  })
})

describe('cache and freshness', () => {
  const table: RateTable = { base: 'USD', date: '2026-10-20', rates: { EUR: 0.9 }, fetchedAt: '2026-10-21T08:00:00.000Z' }

  it('round-trips through local storage per base currency', () => {
    writeCachedRates(table)
    expect(readCachedRates('USD')).toEqual(table)
    expect(readCachedRates('EUR')).toBeNull()
  })

  it('flags old publications as stale and refreshes after 12 hours or for new currencies', () => {
    expect(isRateTableStale(table, new Date('2026-10-22T12:00:00Z'))).toBe(false)
    expect(isRateTableStale(table, new Date('2026-10-26T12:00:00Z'))).toBe(true)
    expect(needsRefresh(table, ['EUR'], new Date('2026-10-21T10:00:00Z'))).toBe(false)
    expect(needsRefresh(table, ['EUR'], new Date('2026-10-21T21:00:00Z'))).toBe(true)
    expect(needsRefresh(table, ['EUR', 'GBP'], new Date('2026-10-21T10:00:00Z'))).toBe(true)
    expect(needsRefresh(null, ['EUR'])).toBe(true)
  })

  it('knows which currencies the source covers', () => {
    expect(isRateSupported('USD')).toBe(true)
    expect(isRateSupported('AED')).toBe(false)
    expect(isRateSupported('KWD')).toBe(false)
  })
})
