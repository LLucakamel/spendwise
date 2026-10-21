import { describe, expect, it } from 'vitest'
import type { IncomeSource } from '@/domain/types'
import { tx } from '@/test/factories'
import { expectedPayments, expectedTotalsByCurrency, incomeReceiptId, nextIncomeDate, occurrenceStatus, sourceAfterReceipt } from './income'

function source(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 'salary',
    name: 'Salary',
    description: '',
    categoryId: 'inc-salary',
    currency: 'EGP',
    expectedAmountMinor: 1_000_000,
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
  } as IncomeSource
}

const receipt = (amountMinor: number, dueDate = '2026-03-01') => tx({ type: 'income', amountMinor, currency: 'EGP', incomeSourceId: 'salary', incomeDueDate: dueDate, categoryId: 'inc-salary' })

describe('income occurrences', () => {
  it('tracks expected, partial and received states and never marks income received by date alone', () => {
    const s = source()
    expect(occurrenceStatus(s, '2026-03-01', [], '2026-03-10')).toMatchObject({ state: 'expected', overdue: true, receivedMinor: 0, remainingMinor: 1_000_000 })
    expect(occurrenceStatus(s, '2026-03-01', [receipt(400_000)], '2026-03-10')).toMatchObject({ state: 'partial', receivedMinor: 400_000, remainingMinor: 600_000, receiptCount: 1 })
    expect(occurrenceStatus(s, '2026-03-01', [receipt(400_000), receipt(700_000)], '2026-03-10')).toMatchObject({ state: 'received', overMinor: 100_000, overdue: false })
  })

  it('ignores receipts in another currency or for another occurrence', () => {
    const other = tx({ type: 'income', amountMinor: 1_000_000, currency: 'USD', incomeSourceId: 'salary', incomeDueDate: '2026-03-01' })
    expect(occurrenceStatus(source(), '2026-03-01', [other, receipt(1_000_000, '2026-04-01')], '2026-03-02').state).toBe('expected')
  })

  it('advances the schedule only when an occurrence is complete', () => {
    const s = source()
    expect(sourceAfterReceipt(s, false)).toEqual({ nextExpectedDate: '2026-03-01', status: 'active' })
    expect(sourceAfterReceipt(s, true)).toEqual({ nextExpectedDate: '2026-04-01', status: 'active' })
    expect(sourceAfterReceipt(source({ endDate: '2026-03-15' }), true).status).toBe('completed')
    expect(sourceAfterReceipt(source({ frequency: 'once' }), true).status).toBe('completed')
    expect(nextIncomeDate({ frequency: 'once', anchorDay: 1 }, '2026-03-01')).toBeNull()
  })

  it('lists expected payments in a range and totals them per currency', () => {
    const sources = [source(), source({ id: 'fx', currency: 'USD', expectedAmountMinor: 50_000, nextExpectedDate: '2026-03-18', anchorDay: 18 }), source({ id: 'paused', status: 'paused' })]
    const items = expectedPayments(sources, [receipt(400_000)], { from: '2026-03-01', to: '2026-04-30' }, '2026-03-05')
    expect(items.map((i) => `${i.source.id}@${i.occurrence.dueDate}`)).toEqual(['salary@2026-03-01', 'fx@2026-03-18', 'salary@2026-04-01', 'fx@2026-04-18'])
    const totals = expectedTotalsByCurrency(items)
    expect(totals.get('EGP')).toBe(600_000 + 1_000_000)
    expect(totals.get('USD')).toBe(100_000)
  })

  it('builds deterministic receipt IDs', () => {
    expect(incomeReceiptId('salary', '2026-03-01', 2)).toBe('inc_salary_2026-03-01_2')
  })
})
