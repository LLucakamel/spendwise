import { describe, expect, it } from 'vitest'
import { tx } from '@/test/factories'
import { applyTransactionFilters, EMPTY_FILTERS, filtersFromParams, filtersToParams } from './transactionFilters'

const names: Record<string, string> = { 'exp-groceries': 'Groceries', 'exp-dining': 'Dining out', 'inc-salary': 'Salary' }
const name = (id: string) => names[id] ?? 'Uncategorized'

const data = [
  tx({ id: 'a', description: 'Greenleaf Market', categoryId: 'exp-groceries', date: '2026-03-01', amountMinor: 5000 }),
  tx({ id: 'b', description: 'Corner Café', categoryId: 'exp-dining', date: '2026-03-05', amountMinor: 1200, notes: 'lunch with Sam' }),
  tx({ id: 'c', description: 'Payroll', type: 'income', categoryId: 'inc-salary', date: '2026-03-01', amountMinor: 400000 }),
  tx({ id: 'd', description: 'Hotel', categoryId: 'exp-dining', date: '2026-02-20', amountMinor: 30000, currency: 'EUR' }),
]

describe('applyTransactionFilters', () => {
  it('searches description, notes and category name case-insensitively', () => {
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, query: 'MARKET' }, name).map((t) => t.id)).toEqual(['a'])
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, query: 'sam' }, name).map((t) => t.id)).toEqual(['b'])
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, query: 'dining' }, name).map((t) => t.id).sort()).toEqual(['b', 'd'])
  })

  it('filters by type, category, currency and inclusive date range', () => {
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, type: 'income' }, name).map((t) => t.id)).toEqual(['c'])
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, categoryId: 'exp-dining', currency: 'USD' }, name).map((t) => t.id)).toEqual(['b'])
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, from: '2026-03-01', to: '2026-03-01' }, name).map((t) => t.id).sort()).toEqual(['a', 'c'])
  })

  it('sorts by date and by amount within a currency', () => {
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, sort: 'date-asc' }, name)[0]?.id).toBe('d')
    expect(applyTransactionFilters(data, { ...EMPTY_FILTERS, currency: 'USD', sort: 'amount-desc' }, name).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('round-trips filters through URL parameters', () => {
    const filters = { ...EMPTY_FILTERS, query: 'x', type: 'expense' as const, from: '2026-01-01', sort: 'amount-asc' as const }
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters)
    expect(filtersFromParams(new URLSearchParams('type=bogus&sort=bogus'))).toEqual(EMPTY_FILTERS)
  })
})

describe('advanced filters', () => {
  const rows = [
    tx({ id: 'a', amountMinor: 500, paymentMethod: 'cash' }),
    tx({ id: 'b', amountMinor: 2500, paymentMethod: 'credit-card' }),
    tx({ id: 'c', amountMinor: 10000, paymentMethod: null }),
    tx({ id: 'j', amountMinor: 3000, currency: 'JPY', paymentMethod: 'cash' }),
  ]

  it('filters by amount range in each transaction’s own currency (inclusive)', () => {
    expect(applyTransactionFilters(rows, { ...EMPTY_FILTERS, minAmount: '5', maxAmount: '25' }, name).map((t) => t.id).sort()).toEqual(['a', 'b'])
    // ¥3,000 is above 25 in its own currency.
    expect(applyTransactionFilters(rows, { ...EMPTY_FILTERS, minAmount: '100' }, name).map((t) => t.id).sort()).toEqual(['c', 'j'])
  })

  it('filters by payment method, including "not specified"', () => {
    expect(applyTransactionFilters(rows, { ...EMPTY_FILTERS, paymentMethod: 'cash' }, name).map((t) => t.id).sort()).toEqual(['a', 'j'])
    expect(applyTransactionFilters(rows, { ...EMPTY_FILTERS, paymentMethod: 'none' }, name).map((t) => t.id)).toEqual(['c'])
  })

  it('combines filters and round-trips them through the URL', () => {
    const filters = { ...EMPTY_FILTERS, currency: 'USD', paymentMethod: 'cash' as const, maxAmount: '10' }
    expect(applyTransactionFilters(rows, filters, name).map((t) => t.id)).toEqual(['a'])
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters)
  })
})
