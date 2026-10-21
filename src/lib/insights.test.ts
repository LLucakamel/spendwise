import { describe, expect, it } from 'vitest'
import { bill, budget, tx } from '@/test/factories'
import { computeInsights, type InsightInput } from './insights'

const base = (overrides: Partial<InsightInput>): InsightInput => ({
  currency: 'USD',
  periodTransactions: [],
  comparisonTransactions: [],
  allTransactions: [],
  budgets: [],
  bills: [],
  month: '2026-03',
  today: '2026-03-20',
  categoryName: (id) => (id === 'exp-groceries' ? 'Groceries' : id === 'exp-dining' ? 'Dining out' : id),
  money: (minor, currency) => `${currency} ${(minor / 100).toFixed(2)}`,
  ...overrides,
})

describe('computeInsights', () => {
  it('returns nothing without data', () => {
    expect(computeInsights(base({}))).toEqual([])
  })

  it('reports budgets near or over their limit and overdue bills', () => {
    const spend = [tx({ amountMinor: 9000, date: '2026-03-05' }), tx({ amountMinor: 3000, categoryId: 'exp-dining', date: '2026-03-06' })]
    const insights = computeInsights(
      base({
        allTransactions: spend,
        budgets: [budget({ id: 'g', name: 'Food', limitMinor: 10000 }), budget({ id: 'd', name: 'Dining', categoryId: 'exp-dining', limitMinor: 2000 })],
        bills: [bill({ name: 'Phone', nextDueDate: '2026-03-18' })],
      }),
    )
    expect(insights.map((i) => i.text)).toEqual([
      '“Food” has used 90% of its monthly limit, with USD 10.00 left.',
      '“Dining” is over budget by USD 10.00 this month.',
      '“Phone” is overdue.',
    ])
    expect(insights.every((i) => i.tone === 'warning')).toBe(true)
  })

  it('describes the top category, spending change, savings and largest expense', () => {
    const period = [
      tx({ amountMinor: 6000, categoryId: 'exp-groceries', description: 'Big shop' }),
      tx({ amountMinor: 2000, categoryId: 'exp-dining' }),
      tx({ type: 'income', amountMinor: 20000, categoryId: 'inc-salary' }),
    ]
    const insights = computeInsights(base({ periodTransactions: period, comparisonTransactions: [tx({ amountMinor: 10000 })] }))
    const text = insights.map((i) => i.text)
    expect(text).toContain('Groceries was your largest expense category: USD 60.00 (75% of USD spending).')
    expect(text).toContain('You spent 20% less in USD than in the comparison period.')
    expect(text).toContain('You kept 60% of your USD income in this period.')
    expect(text).toContain('Largest single expense: “Big shop” for USD 60.00.')
  })

  it('ignores other currencies', () => {
    const insights = computeInsights(base({ periodTransactions: [tx({ currency: 'EUR', amountMinor: 999 }), tx({ currency: 'EUR', categoryId: 'exp-dining' })] }))
    expect(insights).toEqual([])
  })
})
