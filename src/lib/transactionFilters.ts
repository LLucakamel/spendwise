import type { Transaction, TransactionType } from '@/domain/types'

export const SORT_OPTIONS = ['date-desc', 'date-asc', 'amount-desc', 'amount-asc'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const SORT_LABELS: Record<SortOption, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'amount-desc': 'Largest amount',
  'amount-asc': 'Smallest amount',
}

export interface TransactionFilters {
  query: string
  type: TransactionType | ''
  categoryId: string
  currency: string
  from: string
  to: string
  sort: SortOption
}

export const EMPTY_FILTERS: TransactionFilters = {
  query: '',
  type: '',
  categoryId: '',
  currency: '',
  from: '',
  to: '',
  sort: 'date-desc',
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(filters.query || filters.type || filters.categoryId || filters.currency || filters.from || filters.to)
}

/**
 * Applies search, filters and sorting. Search matches description, notes and category name,
 * case-insensitively. Amount sorting compares minor units within each currency and groups
 * different currencies apart, since their amounts are not comparable.
 */
export function applyTransactionFilters(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
  categoryName: (id: string) => string,
): Transaction[] {
  const query = filters.query.trim().toLocaleLowerCase()
  const result = transactions.filter((t) => {
    if (filters.type && t.type !== filters.type) return false
    if (filters.categoryId && t.categoryId !== filters.categoryId) return false
    if (filters.currency && t.currency !== filters.currency) return false
    if (filters.from && t.date < filters.from) return false
    if (filters.to && t.date > filters.to) return false
    if (query) {
      const haystack = `${t.description}\n${t.notes}\n${categoryName(t.categoryId)}`.toLocaleLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
  const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  const byAmount = (a: Transaction, b: Transaction) =>
    a.currency.localeCompare(b.currency) || a.amountMinor - b.amountMinor || byDate(a, b)
  switch (filters.sort) {
    case 'date-asc':
      return result.sort(byDate)
    case 'date-desc':
      return result.sort((a, b) => byDate(b, a))
    case 'amount-asc':
      return result.sort(byAmount)
    case 'amount-desc':
      return result.sort((a, b) => a.currency.localeCompare(b.currency) || b.amountMinor - a.amountMinor || byDate(b, a))
  }
}

export function filtersFromParams(params: URLSearchParams): TransactionFilters {
  const type = params.get('type')
  const sort = params.get('sort')
  return {
    query: params.get('q') ?? '',
    type: type === 'income' || type === 'expense' ? type : '',
    categoryId: params.get('category') ?? '',
    currency: params.get('currency') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: SORT_OPTIONS.includes(sort as SortOption) ? (sort as SortOption) : 'date-desc',
  }
}

export function filtersToParams(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.type) params.set('type', filters.type)
  if (filters.categoryId) params.set('category', filters.categoryId)
  if (filters.currency) params.set('currency', filters.currency)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.sort !== 'date-desc') params.set('sort', filters.sort)
  return params
}
