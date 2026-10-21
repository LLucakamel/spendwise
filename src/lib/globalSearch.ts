import type { FinanceData } from '@/domain/types'

export const SEARCH_TYPES = ['transaction', 'income', 'invoice', 'budget', 'bill', 'account', 'category'] as const
export type SearchResultType = (typeof SEARCH_TYPES)[number]

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  /** Fields the UI formats into a subtitle in the active language. */
  categoryId?: string
  amountMinor?: number
  currency?: string
  date?: string
  detail?: string
  /** Route (relative to the app area) and query that opens the result. */
  path: string
  query: Record<string, string>
}

const LIMIT_PER_TYPE = 6

/**
 * Searches the signed-in user's already-loaded records (never another user's data, and only what
 * the bounded queries loaded). Case-insensitive substring matching on names, descriptions, notes,
 * merchants, numbers and category names — not a full-text index.
 */
export function searchEverything(data: FinanceData, rawQuery: string, categoryName: (id: string) => string, types: readonly SearchResultType[] = SEARCH_TYPES): SearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (query.length < 2) return []
  const has = (...fields: (string | null | undefined)[]) => fields.some((f) => f?.toLocaleLowerCase().includes(query))
  const wants = (type: SearchResultType) => types.includes(type)
  const results: SearchResult[] = []

  if (wants('transaction')) {
    for (const t of data.transactions.filter((t) => has(t.description, t.notes, t.sourceRef, categoryName(t.categoryId))).slice(0, LIMIT_PER_TYPE)) {
      results.push({ type: 'transaction', id: t.id, title: t.description, categoryId: t.categoryId, amountMinor: t.amountMinor, currency: t.currency, date: t.date, detail: t.type, path: '/transactions', query: { open: t.id } })
    }
  }
  if (wants('income')) {
    for (const s of data.incomeSources.filter((s) => has(s.name, s.description, s.notes, categoryName(s.categoryId))).slice(0, LIMIT_PER_TYPE)) {
      results.push({ type: 'income', id: s.id, title: s.name, categoryId: s.categoryId, amountMinor: s.expectedAmountMinor, currency: s.currency, date: s.status === 'active' ? s.nextExpectedDate : undefined, detail: s.frequency, path: '/income', query: { source: s.id } })
    }
  }
  if (wants('invoice')) {
    for (const inv of data.invoices.filter((i) => has(i.merchant, i.invoiceNumber, i.merchantTaxId, i.notes)).slice(0, LIMIT_PER_TYPE)) {
      results.push({ type: 'invoice', id: inv.id, title: inv.merchant || inv.invoiceNumber || inv.id, amountMinor: inv.totalMinor, currency: inv.currency, date: inv.issueDate ?? undefined, detail: inv.invoiceNumber, path: '/invoices', query: { open: inv.id } })
    }
  }
  if (wants('budget')) {
    for (const b of data.budgets.filter((b) => has(b.name, b.notes, categoryName(b.categoryId))).slice(0, LIMIT_PER_TYPE)) {
      results.push({ type: 'budget', id: b.id, title: b.name, categoryId: b.categoryId, amountMinor: b.limitMinor, currency: b.currency, path: '/budgets', query: {} })
    }
  }
  if (wants('bill')) {
    for (const b of data.recurringBills.filter((b) => has(b.name, b.notes, categoryName(b.categoryId))).slice(0, LIMIT_PER_TYPE)) {
      results.push({ type: 'bill', id: b.id, title: b.name, amountMinor: b.amountMinor, currency: b.currency, date: b.status === 'ended' ? undefined : b.nextDueDate, detail: b.frequency, path: '/bills', query: { q: b.name } })
    }
  }
  if (wants('account')) {
    for (const a of data.accounts.filter((a) => has(a.name, a.provider, a.last4, a.notes)).slice(0, LIMIT_PER_TYPE)) {
      results.push({ type: 'account', id: a.id, title: a.name, currency: a.currency, detail: a.kind, path: '/transactions', query: { account: a.id } })
    }
  }
  if (wants('category')) {
    for (const c of data.categories.filter((c) => has(c.name, categoryName(c.id))).slice(0, LIMIT_PER_TYPE)) {
      results.push({
        type: 'category',
        id: c.id,
        title: categoryName(c.id),
        detail: c.type,
        categoryId: c.id,
        amountMinor: data.transactions.filter((t) => t.categoryId === c.id).length,
        path: '/transactions',
        query: { category: c.id },
      })
    }
  }
  return results
}
