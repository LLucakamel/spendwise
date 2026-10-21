import { useMemo } from 'react'
import { useFinance } from '@/data/DataProvider'
import { UNCATEGORIZED_LABEL } from '@/domain/defaults'
import type { Category, IsoDate, IsoMonth } from '@/domain/types'
import { formatDate, formatMonth, formatRange, formatTimestamp, type DateRange } from '@/lib/dates'
import { formatMoney, type FormatMoneyOptions } from '@/lib/money'

/** Formatting helpers bound to the user's locale and date preferences. */
export function useFormat() {
  const { settings } = useFinance()
  return useMemo(() => {
    const { locale, dateFormat } = settings
    return {
      locale,
      money: (minor: number, currency: string, options?: FormatMoneyOptions) =>
        formatMoney(minor, currency, locale, options),
      date: (date: IsoDate) => formatDate(date, dateFormat, locale),
      range: (range: DateRange) => formatRange(range, dateFormat, locale),
      month: (month: IsoMonth) => formatMonth(month, locale),
      timestamp: (value: string) => formatTimestamp(value, locale),
    }
  }, [settings])
}

export function useCategoryLookup() {
  const { categories } = useFinance()
  return useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]))
    return {
      get: (id: string): Category | undefined => map.get(id),
      name: (id: string) => map.get(id)?.name ?? UNCATEGORIZED_LABEL,
      color: (id: string) => map.get(id)?.color ?? '#94a3b8',
    }
  }, [categories])
}
