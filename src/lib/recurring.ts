import { addDays, addMonths, differenceInCalendarDays, getDaysInMonth } from 'date-fns'
import type { BillFrequency, IsoDate, RecurringBill, Transaction } from '@/domain/types'
import { fromIsoDate, toIsoDate } from './dates'

const MONTH_STEP: Record<Exclude<BillFrequency, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

/**
 * The due date after `date`. Month-based schedules keep the bill's anchor day where the
 * month allows it, so a bill due on the 31st falls on Feb 28/29 and returns to the 31st in March.
 */
export function advanceDueDate(date: IsoDate, frequency: BillFrequency, anchorDay: number): IsoDate {
  const current = fromIsoDate(date)
  if (frequency === 'weekly') return toIsoDate(addDays(current, 7))
  const firstOfTarget = addMonths(new Date(current.getFullYear(), current.getMonth(), 1), MONTH_STEP[frequency])
  const day = Math.min(Math.max(1, anchorDay), getDaysInMonth(firstOfTarget))
  return toIsoDate(new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), day))
}

/** Next `count` due dates starting at the bill's next due date, honouring the end date. */
export function upcomingDueDates(
  bill: Pick<RecurringBill, 'nextDueDate' | 'frequency' | 'anchorDay' | 'endDate'>,
  count: number,
): IsoDate[] {
  const dates: IsoDate[] = []
  let cursor = bill.nextDueDate
  while (dates.length < count && (bill.endDate === null || cursor <= bill.endDate)) {
    dates.push(cursor)
    cursor = advanceDueDate(cursor, bill.frequency, bill.anchorDay)
  }
  return dates
}

export type BillTiming = 'overdue' | 'due-today' | 'due-soon' | 'scheduled' | 'paused' | 'ended'

export const DUE_SOON_DAYS = 7

export function billTiming(bill: Pick<RecurringBill, 'status' | 'nextDueDate'>, today: IsoDate): BillTiming {
  if (bill.status === 'paused') return 'paused'
  if (bill.status === 'ended') return 'ended'
  const days = daysUntil(bill.nextDueDate, today)
  if (days < 0) return 'overdue'
  if (days === 0) return 'due-today'
  if (days <= DUE_SOON_DAYS) return 'due-soon'
  return 'scheduled'
}

export function daysUntil(date: IsoDate, today: IsoDate): number {
  return differenceInCalendarDays(fromIsoDate(date), fromIsoDate(today))
}

/** Active bills due on or before `horizonDays` from today (including overdue ones), soonest first. */
export function billsDueWithin(bills: readonly RecurringBill[], today: IsoDate, horizonDays: number): RecurringBill[] {
  return bills
    .filter((b) => b.status === 'active' && daysUntil(b.nextDueDate, today) <= horizonDays)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.name.localeCompare(b.name))
}

/**
 * Deterministic ID for the expense that settles one bill occurrence.
 * Because the ID is derived from the bill and due date, recording the same occurrence twice
 * targets the same document and is rejected instead of creating a duplicate expense.
 */
export function billPaymentTransactionId(billId: string, dueDate: IsoDate): string {
  return `bill_${billId}_${dueDate}`
}

export function isOccurrenceRecorded(transactions: readonly Transaction[], billId: string, dueDate: IsoDate): boolean {
  const id = billPaymentTransactionId(billId, dueDate)
  return transactions.some(
    (t) => t.id === id || (t.recurringBillId === billId && t.recurringDueDate === dueDate),
  )
}

export class DuplicatePaymentError extends Error {
  readonly dueDate: IsoDate

  constructor(dueDate: IsoDate) {
    super(`A payment for the occurrence due ${dueDate} has already been recorded.`)
    this.name = 'DuplicatePaymentError'
    this.dueDate = dueDate
  }
}

/** Bill state after the current occurrence is paid or skipped. */
export function billAfterOccurrence(
  bill: Pick<RecurringBill, 'nextDueDate' | 'frequency' | 'anchorDay' | 'endDate' | 'status' | 'lastPaidDate'>,
  paidDate: IsoDate | null,
): { nextDueDate: IsoDate; status: RecurringBill['status']; lastPaidDate: IsoDate | null } {
  const next = advanceDueDate(bill.nextDueDate, bill.frequency, bill.anchorDay)
  const ended = bill.endDate !== null && next > bill.endDate
  return {
    nextDueDate: next,
    status: ended ? 'ended' : bill.status,
    lastPaidDate: paidDate ?? bill.lastPaidDate,
  }
}

/** Day-of-month anchor implied by a due date. */
export function anchorDayOf(date: IsoDate): number {
  return Number(date.slice(8, 10))
}

/** Approximate cost per month in minor units (weekly × 52 / 12, etc.), rounded. Display-only. */
export function approximateMonthlyCost(bill: Pick<RecurringBill, 'amountMinor' | 'frequency'>): number {
  switch (bill.frequency) {
    case 'weekly':
      return Math.round((bill.amountMinor * 52) / 12)
    case 'monthly':
      return bill.amountMinor
    case 'quarterly':
      return Math.round(bill.amountMinor / 3)
    case 'yearly':
      return Math.round(bill.amountMinor / 12)
  }
}
