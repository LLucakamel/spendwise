import { describe, expect, it } from 'vitest'
import type { IncomeSource, Invoice, SavingsGoal } from '@/domain/types'
import { bill, tx } from '@/test/factories'
import { cashFlowForecast, dataQuality, goalProgress, payoffEstimate, suggestCategory } from './tools'

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'g1',
    name: 'Emergency fund',
    currency: 'USD',
    targetMinor: 120000,
    targetDate: null,
    isEmergencyFund: true,
    contributions: [],
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function source(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 's1',
    name: 'Salary',
    categoryId: 'inc-salary',
    description: '',
    currency: 'USD',
    expectedAmountMinor: 50000,
    frequency: 'monthly',
    nextExpectedDate: '2026-03-25',
    anchorDay: 25,
    endDate: null,
    accountId: null,
    status: 'active',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('goalProgress', () => {
  it('sums contributions and estimates the monthly amount still needed', () => {
    const result = goalProgress(
      goal({
        targetDate: '2026-07-01',
        contributions: [
          { date: '2026-01-10', amountMinor: 10000, note: '' },
          { date: '2026-02-10', amountMinor: 20000, note: '' },
        ],
      }),
      '2026-03-01',
    )
    expect(result.savedMinor).toBe(30000)
    expect(result.remainingMinor).toBe(90000)
    expect(result.ratio).toBeCloseTo(0.25)
    expect(result.monthlyNeeded).toBe(22500) // 90000 over 4 months
  })

  it('never reports a negative remainder once the goal is reached', () => {
    const result = goalProgress(goal({ targetDate: '2026-07-01', contributions: [{ date: '2026-01-10', amountMinor: 150000, note: '' }] }), '2026-03-01')
    expect(result.remainingMinor).toBe(0)
    expect(result.monthlyNeeded).toBeNull()
  })
})

describe('payoffEstimate', () => {
  it('pays off a zero-interest balance in balance / payment months', () => {
    expect(payoffEstimate(100000, 0, 25000)).toEqual({ months: 4, totalInterestMinor: 0, neverPaysOff: false })
  })

  it('adds monthly interest', () => {
    const result = payoffEstimate(100000, 12, 50000)
    expect(result.neverPaysOff).toBe(false)
    expect(result.months).toBe(3)
    expect(result.totalInterestMinor).toBeGreaterThan(0)
  })

  it('flags payments that do not cover the interest', () => {
    expect(payoffEstimate(100000, 24, 2000)).toEqual({ months: null, totalInterestMinor: null, neverPaysOff: true })
  })

  it('returns unknown without a payment and zero months without a balance', () => {
    expect(payoffEstimate(100000, 10, 0)).toEqual({ months: null, totalInterestMinor: null, neverPaysOff: false })
    expect(payoffEstimate(0, 10, 1000)).toEqual({ months: 0, totalInterestMinor: 0, neverPaysOff: false })
  })
})

describe('cashFlowForecast', () => {
  it('adds expected income and subtracts scheduled bills in the chosen currency only', () => {
    const result = cashFlowForecast(
      100000,
      'USD',
      {
        recurringBills: [
          bill({ amountMinor: 30000, nextDueDate: '2026-03-10', anchorDay: 10 }),
          bill({ id: 'bill2', currency: 'EUR', amountMinor: 99999, nextDueDate: '2026-03-05', anchorDay: 5 }),
        ],
        incomeSources: [source()],
        transactions: [],
      },
      '2026-03-01',
      30,
    )
    expect(result.points).toHaveLength(31)
    expect(result.billsMinor).toBe(30000)
    expect(result.incomeMinor).toBe(50000)
    expect(result.points.at(-1)?.balanceMinor).toBe(120000)
    const lowest = Math.min(...result.points.map((p) => p.balanceMinor))
    expect(lowest).toBe(70000)
    expect(result.points.find((p) => p.balanceMinor === 70000)?.date).toBe('2026-03-10')
  })
})

describe('dataQuality', () => {
  it('reports uncategorized, duplicate, unassigned, unlinked and future-dated records', () => {
    const transactions = [
      tx({ id: 'a', categoryId: 'missing', description: 'Coffee', date: '2026-03-01' }),
      tx({ id: 'b', description: 'Lunch', date: '2026-03-02', accountId: 'acc' }),
      tx({ id: 'c', description: 'Lunch', date: '2026-03-02', accountId: 'acc' }),
      tx({ id: 'd', description: 'Later', date: '2026-04-01', accountId: 'acc' }),
      tx({ id: 'e', type: 'transfer', categoryId: 'transfer', description: 'Move', accountId: 'acc', toAccountId: 'acc2' }),
    ]
    const invoices = [{ id: 'i1', status: 'paid', linkedTransactionIds: [] }] as unknown as Invoice[]
    const issues = dataQuality(transactions, new Set(['exp-groceries']), invoices, true, '2026-03-15')
    const byKind = new Map(issues.map((i) => [i.kind, i]))
    expect(byKind.get('uncategorized')?.sampleIds).toEqual(['a'])
    expect(byKind.get('possible-duplicate')?.count).toBe(1)
    expect(byKind.get('possible-duplicate')?.sampleIds).toEqual(['b', 'c'])
    expect(byKind.get('no-account')?.sampleIds).toEqual(['a'])
    expect(byKind.get('unlinked-invoice')?.sampleIds).toEqual(['i1'])
    expect(byKind.get('future-dated')?.sampleIds).toEqual(['d'])
  })

  it('returns nothing for clean data', () => {
    expect(dataQuality([tx({ accountId: 'acc' })], new Set(['exp-groceries']), [], true, '2026-03-15')).toEqual([])
  })
})

describe('suggestCategory', () => {
  const history = [
    tx({ description: 'Carrefour groceries', categoryId: 'exp-groceries' }),
    tx({ description: 'carrefour weekly', categoryId: 'exp-groceries' }),
    tx({ description: 'Carrefour mall parking', categoryId: 'exp-transport' }),
  ]

  it('suggests the category used most often for the same first word', () => {
    expect(suggestCategory('Carrefour', 'expense', history)).toBe('exp-groceries')
  })

  it('needs at least two matches and the same type', () => {
    expect(suggestCategory('Parking garage', 'expense', history)).toBeNull()
    expect(suggestCategory('Carrefour refund', 'income', history)).toBeNull()
    expect(suggestCategory('ab', 'expense', history)).toBeNull()
  })
})
