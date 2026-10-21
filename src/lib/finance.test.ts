import { describe, expect, it } from 'vitest'
import { budget, tx } from '@/test/factories'
import type { Account } from '@/domain/types'
import {
  accountBalances,
  balancesByCurrency,
  budgetAppliesToMonth,
  budgetsOverlap,
  budgetUsage,
  categoryBreakdown,
  filterByRange,
  percentChange,
  timeSeries,
  totalsByCurrency,
} from './finance'

describe('totalsByCurrency', () => {
  it('totals income and expenses and nets them', () => {
    const totals = totalsByCurrency([
      tx({ type: 'income', amountMinor: 500000 }),
      tx({ amountMinor: 1999 }),
      tx({ amountMinor: 1 }),
    ])
    expect(totals).toEqual([{ currency: 'USD', incomeMinor: 500000, expenseMinor: 2000, netMinor: 498000, refundMinor: 0, count: 3 }])
  })

  it('never adds amounts in different currencies together', () => {
    const totals = totalsByCurrency(
      [tx({ amountMinor: 1000, currency: 'USD' }), tx({ amountMinor: 1000, currency: 'EUR' }), tx({ amountMinor: 500, currency: 'JPY' })],
      'EUR',
    )
    expect(totals.map((t) => [t.currency, t.expenseMinor])).toEqual([
      ['EUR', 1000],
      ['JPY', 500],
      ['USD', 1000],
    ])
  })

  it('handles exact decimal sums such as 0.10 + 0.20', () => {
    const [usd] = totalsByCurrency([tx({ amountMinor: 10 }), tx({ amountMinor: 20 })])
    expect(usd?.expenseMinor).toBe(30)
  })
})

describe('filterByRange', () => {
  const items = [tx({ date: '2026-02-28' }), tx({ date: '2026-03-01' }), tx({ date: '2026-03-31' }), tx({ date: '2026-04-01' })]

  it('includes both boundary dates', () => {
    expect(filterByRange(items, { from: '2026-03-01', to: '2026-03-31' }).map((t) => t.date)).toEqual(['2026-03-01', '2026-03-31'])
  })

  it('supports single-day ranges', () => {
    expect(filterByRange(items, { from: '2026-02-28', to: '2026-02-28' })).toHaveLength(1)
  })
})

describe('categoryBreakdown', () => {
  it('groups expenses by category for one currency only, largest first', () => {
    const result = categoryBreakdown(
      [
        tx({ categoryId: 'a', amountMinor: 300 }),
        tx({ categoryId: 'b', amountMinor: 700 }),
        tx({ categoryId: 'a', amountMinor: 200, currency: 'EUR' }),
        tx({ categoryId: 'c', amountMinor: 999, type: 'income' }),
      ],
      'USD',
    )
    expect(result.map((r) => [r.categoryId, r.totalMinor, r.share])).toEqual([
      ['b', 700, 0.7],
      ['a', 300, 0.3],
    ])
  })
})

describe('timeSeries', () => {
  it('creates a bucket for every day and fills in totals', () => {
    const series = timeSeries(
      [tx({ date: '2026-03-02', amountMinor: 100 }), tx({ date: '2026-03-02', type: 'income', amountMinor: 1000 }), tx({ date: '2026-03-05', currency: 'EUR' })],
      'USD',
      { from: '2026-03-01', to: '2026-03-03' },
      'day',
      1,
    )
    expect(series).toEqual([
      { start: '2026-03-01', incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
      { start: '2026-03-02', incomeMinor: 1000, expenseMinor: 100, netMinor: 900 },
      { start: '2026-03-03', incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
    ])
  })

  it('groups by month', () => {
    const series = timeSeries([tx({ date: '2026-01-31' }), tx({ date: '2026-02-01' })], 'USD', { from: '2026-01-01', to: '2026-02-28' }, 'month', 1)
    expect(series.map((b) => [b.start, b.expenseMinor])).toEqual([
      ['2026-01-01', 1000],
      ['2026-02-01', 1000],
    ])
  })
})

describe('balancesByCurrency', () => {
  it('adds transactions to the opening balance up to the as-of date', () => {
    const balances = balancesByCurrency(
      [
        tx({ type: 'income', amountMinor: 10000, date: '2026-03-01' }),
        tx({ amountMinor: 2500, date: '2026-03-02' }),
        tx({ amountMinor: 99999, date: '2026-03-20' }),
        tx({ amountMinor: 300, currency: 'EUR', date: '2026-03-01' }),
      ],
      [{ currency: 'USD', amountMinor: 50000 }],
      '2026-03-10',
      'USD',
    )
    expect(balances).toEqual([
      { currency: 'USD', openingMinor: 50000, hasOpeningBalance: true, balanceMinor: 57500 },
      { currency: 'EUR', openingMinor: 0, hasOpeningBalance: false, balanceMinor: -300 },
    ])
  })
})

describe('budgetUsage', () => {
  const b = budget({ limitMinor: 10000 })

  it('counts only matching expenses in the budget month, category and currency', () => {
    const usage = budgetUsage(
      b,
      [
        tx({ amountMinor: 3000, date: '2026-03-01' }),
        tx({ amountMinor: 2000, date: '2026-03-31' }),
        tx({ amountMinor: 5000, date: '2026-04-01' }), // other month
        tx({ amountMinor: 5000, categoryId: 'exp-dining', date: '2026-03-10' }), // other category
        tx({ amountMinor: 5000, type: 'income', date: '2026-03-10' }), // income never counts
        tx({ amountMinor: 5000, currency: 'EUR', date: '2026-03-10' }), // other currency
      ],
      '2026-03',
    )
    expect(usage.spentMinor).toBe(5000)
    expect(usage.remainingMinor).toBe(5000)
    expect(usage.ratio).toBe(0.5)
    expect(usage.health).toBe('ok')
    expect(usage.transactionCount).toBe(2)
    expect(usage.otherCurrencyCount).toBe(1)
  })

  it('does not double-count a transaction listed twice', () => {
    const t = tx({ amountMinor: 4000, date: '2026-03-05' })
    expect(budgetUsage(b, [t, t], '2026-03').spentMinor).toBe(4000)
  })

  it('warns at 80% and flags overspending', () => {
    expect(budgetUsage(b, [tx({ amountMinor: 8000 })], '2026-03').health).toBe('warning')
    expect(budgetUsage(b, [tx({ amountMinor: 10000 })], '2026-03').health).toBe('warning')
    const over = budgetUsage(b, [tx({ amountMinor: 10001 })], '2026-03')
    expect(over.health).toBe('over')
    expect(over.remainingMinor).toBe(-1)
  })

  it('reports nothing for months outside the budget period', () => {
    const limited = budget({ startMonth: '2026-04', endMonth: '2026-05' })
    expect(budgetAppliesToMonth(limited, '2026-03')).toBe(false)
    expect(budgetAppliesToMonth(limited, '2026-05')).toBe(true)
    expect(budgetAppliesToMonth(limited, '2026-06')).toBe(false)
    expect(budgetUsage(limited, [tx({ date: '2026-03-10' })], '2026-03').spentMinor).toBe(0)
  })
})

describe('budgetsOverlap', () => {
  it('detects same category and currency with overlapping months', () => {
    expect(budgetsOverlap(budget({ startMonth: '2026-01', endMonth: null }), budget({ startMonth: '2026-06', endMonth: '2026-06' }))).toBe(true)
    expect(budgetsOverlap(budget({ startMonth: '2026-01', endMonth: '2026-03' }), budget({ startMonth: '2026-04', endMonth: null }))).toBe(false)
    expect(budgetsOverlap(budget(), budget({ currency: 'EUR' }))).toBe(false)
    expect(budgetsOverlap(budget(), budget({ categoryId: 'exp-dining' }))).toBe(false)
  })
})

describe('percentChange', () => {
  it('returns null without a baseline', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(-50, -100)).toBe(50)
  })
})

describe('transfers and refunds', () => {
  const account = (id: string, kind: Account['kind'], openingBalanceMinor = 0): Account =>
    ({ id, name: id, kind, provider: '', currency: 'EGP', openingBalanceMinor, last4: '', syncMode: 'manual', creditLimitMinor: kind === 'credit-card' ? 100000 : null, statementDay: null, paymentDueDay: null, minimumPaymentMinor: null, archived: false, notes: '', createdAt: '', updatedAt: '' }) as Account

  it('never counts a transfer between own accounts as income or expense', () => {
    const totals = totalsByCurrency([
      tx({ type: 'income', amountMinor: 10000, currency: 'EGP' }),
      tx({ type: 'transfer', amountMinor: 4000, currency: 'EGP', categoryId: 'transfer', accountId: 'bank', toAccountId: 'cash' }),
    ])
    expect(totals[0]).toMatchObject({ incomeMinor: 10000, expenseMinor: 0, netMinor: 10000 })
  })

  it('treats a refund as reduced spending, not income', () => {
    const totals = totalsByCurrency([tx({ type: 'expense', amountMinor: 5000, currency: 'EGP' }), tx({ type: 'refund', amountMinor: 1500, currency: 'EGP' })])
    expect(totals[0]).toMatchObject({ incomeMinor: 0, expenseMinor: 3500, refundMinor: 1500, netMinor: -3500 })
  })

  it('moves money between accounts and reduces card debt on repayment', () => {
    const accounts = [account('bank', 'bank', 50000), account('card', 'credit-card')]
    const balances = accountBalances(
      accounts,
      [
        tx({ type: 'expense', amountMinor: 20000, currency: 'EGP', accountId: 'card', date: '2026-03-01' }),
        tx({ type: 'transfer', amountMinor: 15000, currency: 'EGP', categoryId: 'transfer', accountId: 'bank', toAccountId: 'card', date: '2026-03-02' }),
      ],
      '2026-03-31',
    )
    expect(balances.find((b) => b.accountId === 'bank')?.balanceMinor).toBe(35000)
    expect(balances.find((b) => b.accountId === 'card')).toMatchObject({ owedMinor: 5000, availableCreditMinor: 95000 })
  })
})
