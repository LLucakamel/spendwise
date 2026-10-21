import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchRates,
  isRateSupported,
  needsRefresh,
  RateError,
  readCachedRates,
  writeCachedRates,
  type RateTable,
} from '@/lib/exchangeRates'

export type RatesState =
  | { status: 'idle'; table: RateTable | null; error: null }
  | { status: 'loading'; table: RateTable | null; error: null }
  | { status: 'ready'; table: RateTable; error: null }
  | { status: 'error'; table: RateTable | null; error: RateError }

/**
 * Loads rates for converting `currencies` into `target`, only after `enabled` becomes true.
 * A cached table is shown immediately; when a refresh fails the cached table stays visible
 * with its original date, and the error is reported alongside it.
 */
export function useExchangeRates(target: string, currencies: readonly string[], enabled: boolean) {
  const [state, setState] = useState<RatesState>(() => ({ status: 'idle', table: readCachedRates(target), error: null }))
  const requested = useRef('')
  const key = `${target}|${[...currencies].sort().join(',')}`

  const load = useCallback(
    async (force: boolean) => {
      const cached = readCachedRates(target)
      if (!isRateSupported(target)) {
        setState({ status: 'error', table: null, error: new RateError('unsupported', `${target} isn’t covered by the exchange-rate source.`) })
        return
      }
      if (!force && cached && !needsRefresh(cached, currencies)) {
        setState({ status: 'ready', table: cached, error: null })
        return
      }
      setState({ status: 'loading', table: cached, error: null })
      try {
        const table = await fetchRates(target, currencies)
        writeCachedRates(table)
        setState({ status: 'ready', table, error: null })
      } catch (error) {
        const rateError = error instanceof RateError ? error : new RateError('network', 'Exchange rates are unavailable right now.')
        setState({ status: 'error', table: cached, error: rateError })
      }
    },
    // currencies is captured through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  useEffect(() => {
    if (!enabled || requested.current === key) return
    requested.current = key
    void load(false)
  }, [enabled, key, load])

  return { ...state, refresh: () => load(true) }
}
