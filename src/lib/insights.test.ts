import { describe, expect, it } from 'vitest'
import type { IncomeSource } from '@/domain/types'
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

function source(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 'src1',
    name: 'Salary',
    categoryId: 'inc-salary',
    description: '',
    currency: 'USD',
    expectedAmountMinor: 500000,
    frequency: 'monthly',
    nextExpectedDate: '2026-03-01',
    anchorDay: 1,
    endDate: null,
    accountId: null,
    status: 'active',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

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
    expect(insights.map(({ key, vars }) => ({ key, vars }))).toEqual([
      { key: 'insights.budgetNear', vars: { name: 'Food', percent: 90, amount: 'USD 10.00' } },
      { key: 'insights.budgetOver', vars: { name: 'Dining', amount: 'USD 10.00' } },
      { key: 'insights.billOverdue', vars: { name: 'Phone' } },
    ])
    expect(insights.every((i) => i.tone === 'warning')).toBe(true)
  })

  it('counts several overdue bills', () => {
    const insights = computeInsights(
      base({ bills: [bill({ id: 'a', nextDueDate: '2026-03-18' }), bill({ id: 'b', nextDueDate: '2026-03-10' }), bill({ id: 'c', nextDueDate: '2026-03-25' })] }),
    )
    expect(insights).toEqual([{ id: 'bills-overdue', tone: 'warning', key: 'insights.billsOverdue', vars: { count: 2 } }])
  })

  it('reports overdue expected income that has not been received', () => {
    const sources = [source({ id: 'late', nextExpectedDate: '2026-02-01' }), source({ id: 'future', nextExpectedDate: '2026-03-25' })]
    // February's salary was received in full; March 1st is still outstanding.
    const received = [tx({ type: 'income', amountMinor: 500000, categoryId: 'inc-salary', incomeSourceId: 'late', incomeDueDate: '2026-02-01', date: '2026-02-01' })]
    const insights = computeInsights(base({ incomeSources: sources, allTransactions: received }))
    expect(insights).toEqual([{ id: 'income-overdue', tone: 'warning', key: 'insights.incomeOverdue', vars: { count: 1 } }])

    const paused = computeInsights(base({ incomeSources: [source({ status: 'paused' })] }))
    expect(paused).toEqual([])
  })

  it('describes the top category, spending change, savings and largest expense', () => {
    const period = [
      tx({ amountMinor: 6000, categoryId: 'exp-groceries', description: 'Big shop' }),
      tx({ amountMinor: 2000, categoryId: 'exp-dining' }),
      tx({ type: 'income', amountMinor: 20000, categoryId: 'inc-salary' }),
    ]
    const insights = computeInsights(base({ periodTransactions: period, comparisonTransactions: [tx({ amountMinor: 10000 })] }))
    const byKey = Object.fromEntries(insights.map((i) => [i.key, i.vars]))
    expect(byKey['insights.topCategory']).toEqual({ category: 'Groceries', amount: 'USD 60.00', percent: 75, currency: 'USD' })
    expect(byKey['insights.spentLess']).toEqual({ percent: 20, currency: 'USD' })
    expect(byKey['insights.kept']).toEqual({ percent: 60, currency: 'USD' })
    expect(byKey['insights.largest']).toEqual({ name: 'Big shop', amount: 'USD 60.00' })
    expect(insights.find((i) => i.key === 'insights.spentLess')?.tone).toBe('positive')
  })

  it('reports higher spending as neutral and nets refunds', () => {
    const period = [tx({ amountMinor: 15000 }), tx({ type: 'refund', amountMinor: 1000 })]
    const insights = computeInsights(base({ periodTransactions: period, comparisonTransactions: [tx({ amountMinor: 10000 })] }))
    expect(insights.find((i) => i.id === 'spending-change')).toEqual({
      id: 'spending-change',
      tone: 'neutral',
      key: 'insights.spentMore',
      vars: { percent: 40, currency: 'USD' },
    })
  })

  it('ignores other currencies', () => {
    const insights = computeInsights(base({ periodTransactions: [tx({ currency: 'EUR', amountMinor: 999 }), tx({ currency: 'EUR', categoryId: 'exp-dining' })] }))
    expect(insights).toEqual([])
  })
})
