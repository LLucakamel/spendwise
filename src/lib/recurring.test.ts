import { describe, expect, it } from 'vitest'
import { bill, tx } from '@/test/factories'
import {
  advanceDueDate,
  approximateMonthlyCost,
  billAfterOccurrence,
  billPaymentTransactionId,
  billsDueWithin,
  billTiming,
  isOccurrenceRecorded,
  upcomingDueDates,
} from './recurring'

describe('advanceDueDate', () => {
  it('adds a week for weekly bills, across month and year ends', () => {
    expect(advanceDueDate('2026-12-29', 'weekly', 29)).toBe('2027-01-05')
  })

  it('keeps month-end bills on the anchor day where possible', () => {
    expect(advanceDueDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
    expect(advanceDueDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(advanceDueDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29')
    expect(advanceDueDate('2026-04-30', 'monthly', 31)).toBe('2026-05-31')
  })

  it('handles quarterly and yearly schedules, including leap days', () => {
    expect(advanceDueDate('2026-11-30', 'quarterly', 30)).toBe('2027-02-28')
    expect(advanceDueDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
    expect(advanceDueDate('2029-02-28', 'yearly', 29)).toBe('2030-02-28')
    expect(advanceDueDate('2031-02-28', 'yearly', 29)).toBe('2032-02-29')
  })
})

describe('upcomingDueDates', () => {
  it('stops at the end date', () => {
    expect(upcomingDueDates(bill({ nextDueDate: '2026-01-31', endDate: '2026-04-15' }), 10)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
})

describe('billTiming and billsDueWithin', () => {
  it('classifies overdue, due today, due soon and scheduled bills', () => {
    expect(billTiming(bill({ nextDueDate: '2026-03-09' }), '2026-03-10')).toBe('overdue')
    expect(billTiming(bill({ nextDueDate: '2026-03-10' }), '2026-03-10')).toBe('due-today')
    expect(billTiming(bill({ nextDueDate: '2026-03-17' }), '2026-03-10')).toBe('due-soon')
    expect(billTiming(bill({ nextDueDate: '2026-03-18' }), '2026-03-10')).toBe('scheduled')
    expect(billTiming(bill({ status: 'paused', nextDueDate: '2026-01-01' }), '2026-03-10')).toBe('paused')
  })

  it('lists active bills due within the horizon, including overdue ones', () => {
    const bills = [
      bill({ id: 'a', nextDueDate: '2026-03-20' }),
      bill({ id: 'b', nextDueDate: '2026-03-01' }),
      bill({ id: 'c', nextDueDate: '2026-03-12', status: 'paused' }),
      bill({ id: 'd', nextDueDate: '2026-05-01' }),
    ]
    expect(billsDueWithin(bills, '2026-03-10', 14).map((b) => b.id)).toEqual(['b', 'a'])
  })
})

describe('duplicate payment prevention', () => {
  it('derives a deterministic transaction id per bill occurrence', () => {
    expect(billPaymentTransactionId('bill1', '2026-03-31')).toBe('bill_bill1_2026-03-31')
    expect(billPaymentTransactionId('bill1', '2026-03-31')).toBe(billPaymentTransactionId('bill1', '2026-03-31'))
    expect(billPaymentTransactionId('bill1', '2026-04-30')).not.toBe(billPaymentTransactionId('bill1', '2026-03-31'))
  })

  it('detects an occurrence that was already recorded', () => {
    const paid = tx({ id: 'bill_bill1_2026-03-31', recurringBillId: 'bill1', recurringDueDate: '2026-03-31' })
    expect(isOccurrenceRecorded([paid], 'bill1', '2026-03-31')).toBe(true)
    expect(isOccurrenceRecorded([paid], 'bill1', '2026-04-30')).toBe(false)
    expect(isOccurrenceRecorded([paid], 'bill2', '2026-03-31')).toBe(false)
  })

  it('advances the bill and ends it after the final occurrence', () => {
    const b = bill({ nextDueDate: '2026-03-31', endDate: '2026-04-15' })
    expect(billAfterOccurrence(b, '2026-03-30')).toEqual({ nextDueDate: '2026-04-30', status: 'ended', lastPaidDate: '2026-03-30' })
    expect(billAfterOccurrence(bill({ nextDueDate: '2026-03-31' }), null)).toEqual({ nextDueDate: '2026-04-30', status: 'active', lastPaidDate: null })
  })
})

describe('approximateMonthlyCost', () => {
  it('normalises frequencies to a monthly figure', () => {
    expect(approximateMonthlyCost({ amountMinor: 1200, frequency: 'yearly' })).toBe(100)
    expect(approximateMonthlyCost({ amountMinor: 300, frequency: 'quarterly' })).toBe(100)
    expect(approximateMonthlyCost({ amountMinor: 1200, frequency: 'weekly' })).toBe(5200)
  })
})
