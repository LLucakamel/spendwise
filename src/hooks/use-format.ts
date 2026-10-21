import { useMemo } from 'react'
import { useFinance } from '@/data/DataProvider'
import { DEFAULT_CATEGORY_NAMES } from '@/domain/defaults'
import { TRANSFER_CATEGORY_ID, type Category, type IsoDate, type IsoMonth } from '@/domain/types'
import { useI18n, type MessageKey } from '@/i18n'
import { formatDate, formatMonth, formatRange, formatTimestamp, type DateRange } from '@/lib/dates'
import { formatMoney, type FormatMoneyOptions } from '@/lib/money'

/** Formatting helpers bound to the user's language, locale and date preferences. */
export function useFormat() {
  const { settings } = useFinance()
  const { formatLocale } = useI18n()
  return useMemo(() => {
    const locale = formatLocale(settings.locale)
    const { dateFormat } = settings
    return {
      locale,
      money: (minor: number, currency: string, options?: FormatMoneyOptions) => formatMoney(minor, currency, locale, options),
      date: (date: IsoDate) => formatDate(date, dateFormat, locale),
      range: (range: DateRange) => formatRange(range, dateFormat, locale),
      month: (month: IsoMonth) => formatMonth(month, locale),
      timestamp: (value: string) => formatTimestamp(value, locale),
      number: (value: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value),
    }
  }, [settings, formatLocale])
}

/**
 * Category names in the active language: default categories keep their translated label until
 * the user renames them; user-created categories show their own name.
 */
export function useCategoryLookup() {
  const { categories } = useFinance()
  const { t } = useI18n()
  return useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]))
    const name = (id: string) => {
      if (id === TRANSFER_CATEGORY_ID) return t('common.transfer')
      const category = map.get(id)
      if (!category) return t('common.uncategorized')
      const defaultName = DEFAULT_CATEGORY_NAMES.get(id)
      if (defaultName && defaultName === category.name) return t(`categoriesDefault.${id}` as MessageKey)
      return category.name
    }
    return {
      get: (id: string): Category | undefined => map.get(id),
      name,
      color: (id: string) => (id === TRANSFER_CATEGORY_ID ? '#94a3b8' : (map.get(id)?.color ?? '#94a3b8')),
    }
  }, [categories, t])
}

export function useAccountLookup() {
  const { accounts } = useFinance()
  const { t } = useI18n()
  return useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a]))
    return {
      get: (id: string | null) => (id ? map.get(id) : undefined),
      name: (id: string | null) => (id ? (map.get(id)?.name ?? t('common.unknown')) : t('common.noAccount')),
    }
  }, [accounts, t])
}
