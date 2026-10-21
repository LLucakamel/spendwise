import type { FinanceData } from '@/domain/types'

export type SearchResultType = 'transaction' | 'category' | 'budget' | 'bill'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string
  /** Amount to show, in its own currency. */
  amountMinor?: number
  currency?: string
  date?: string
  /** Route (relative to the app area) and query that opens the result. */
  path: string
  query: Record<string, string>
}

const LIMIT_PER_TYPE = 6

function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  return fields.some((f) => f?.toLocaleLowerCase().includes(query))
}

/**
 * Searches the signed-in user's already-loaded records (never another user's data).
 * Matching is case-insensitive substring matching on names, descriptions, notes and categories.
 */
export function searchEverything(data: FinanceData, rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (query.length < 2) return []
  const categoryName = new Map(data.categories.map((c) => [c.id, c.name]))
  const name = (id: string) => categoryName.get(id) ?? 'Uncategorized'

  const transactions = data.transactions
    .filter((t) => matches(query, t.description, t.notes, name(t.categoryId)))
    .slice(0, LIMIT_PER_TYPE)
    .map<SearchResult>((t) => ({
      type: 'transaction',
      id: t.id,
      title: t.description,
      subtitle: `${t.type === 'income' ? 'Income' : 'Expense'} · ${name(t.categoryId)}`,
      amountMinor: t.amountMinor,
      currency: t.currency,
      date: t.date,
      path: '/transactions',
      query: { open: t.id },
    }))

  const categories = data.categories
    .filter((c) => matches(query, c.name))
    .slice(0, LIMIT_PER_TYPE)
    .map<SearchResult>((c) => ({
      type: 'category',
      id: c.id,
      title: c.name,
      subtitle: `${c.type === 'income' ? 'Income' : 'Expense'} category · ${data.transactions.filter((t) => t.categoryId === c.id).length} transactions`,
      path: '/transactions',
      query: { category: c.id },
    }))

  const budgets = data.budgets
    .filter((b) => matches(query, b.name, b.notes, name(b.categoryId)))
    .slice(0, LIMIT_PER_TYPE)
    .map<SearchResult>((b) => ({
      type: 'budget',
      id: b.id,
      title: b.name,
      subtitle: `Monthly budget · ${name(b.categoryId)}`,
      amountMinor: b.limitMinor,
      currency: b.currency,
      path: '/budgets',
      query: {},
    }))

  const bills = data.recurringBills
    .filter((b) => matches(query, b.name, b.notes, name(b.categoryId)))
    .slice(0, LIMIT_PER_TYPE)
    .map<SearchResult>((b) => ({
      type: 'bill',
      id: b.id,
      title: b.name,
      subtitle: `Recurring ${b.frequency} · ${b.status}`,
      amountMinor: b.amountMinor,
      currency: b.currency,
      date: b.status === 'ended' ? undefined : b.nextDueDate,
      path: '/bills',
      query: { q: b.name },
    }))

  return [...transactions, ...categories, ...budgets, ...bills]
}
