import type { IncomeSource, IsoDate, Transaction } from '@/domain/types'
import { isInRange, type DateRange } from './dates'
import { addMinor } from './money'
import { advanceDueDate, daysUntil } from './recurring'

/**
 * Expected income comes from income sources (a schedule and an expected amount). It is a
 * forecast: only income transactions linked to a source count as received money. Nothing is
 * ever marked received automatically when a date passes.
 */

export function nextIncomeDate(source: Pick<IncomeSource, 'frequency' | 'anchorDay'>, date: IsoDate): IsoDate | null {
  if (source.frequency === 'once') return null
  return advanceDueDate(date, source.frequency, source.anchorDay)
}

/** Income transactions recorded against one expected payment of a source. */
export function receiptsFor(transactions: readonly Transaction[], sourceId: string, dueDate: IsoDate): Transaction[] {
  return transactions.filter((t) => t.type === 'income' && t.incomeSourceId === sourceId && t.incomeDueDate === dueDate)
}

export interface OccurrenceStatus {
  dueDate: IsoDate
  currency: string
  expectedMinor: number
  /** Received so far in the source's currency. */
  receivedMinor: number
  /** Expected − received, never below zero. */
  remainingMinor: number
  /** Received more than expected (e.g. a bonus). */
  overMinor: number
  state: 'expected' | 'partial' | 'received'
  overdue: boolean
  receiptCount: number
}

export function occurrenceStatus(
  source: Pick<IncomeSource, 'id' | 'currency' | 'expectedAmountMinor'>,
  dueDate: IsoDate,
  transactions: readonly Transaction[],
  today: IsoDate,
): OccurrenceStatus {
  const receipts = receiptsFor(transactions, source.id, dueDate).filter((t) => t.currency === source.currency)
  const received = receipts.reduce((sum, t) => addMinor(sum, t.amountMinor), 0)
  const remaining = Math.max(0, source.expectedAmountMinor - received)
  const state = received === 0 ? 'expected' : remaining > 0 ? 'partial' : 'received'
  return {
    dueDate,
    currency: source.currency,
    expectedMinor: source.expectedAmountMinor,
    receivedMinor: received,
    remainingMinor: remaining,
    overMinor: Math.max(0, received - source.expectedAmountMinor),
    state,
    overdue: state !== 'received' && daysUntil(dueDate, today) < 0,
    receiptCount: receipts.length,
  }
}

/** State of a source after recording a receipt for its current occurrence. */
export function sourceAfterReceipt(
  source: Pick<IncomeSource, 'frequency' | 'anchorDay' | 'nextExpectedDate' | 'endDate' | 'status'>,
  occurrenceComplete: boolean,
): { nextExpectedDate: IsoDate; status: IncomeSource['status'] } {
  if (!occurrenceComplete) return { nextExpectedDate: source.nextExpectedDate, status: source.status }
  const next = nextIncomeDate(source, source.nextExpectedDate)
  if (next === null || (source.endDate !== null && next > source.endDate)) {
    return { nextExpectedDate: source.nextExpectedDate, status: 'completed' }
  }
  return { nextExpectedDate: next, status: source.status }
}

/** Expected (not yet received) payments of active sources within a range, oldest first. */
export function expectedPayments(
  sources: readonly IncomeSource[],
  transactions: readonly Transaction[],
  range: DateRange,
  today: IsoDate,
  includeOverdueBefore = false,
): { source: IncomeSource; occurrence: OccurrenceStatus }[] {
  const result: { source: IncomeSource; occurrence: OccurrenceStatus }[] = []
  for (const source of sources) {
    if (source.status !== 'active') continue
    let date: IsoDate | null = source.nextExpectedDate
    let guard = 0
    while (date && date <= range.to && guard < 400) {
      guard += 1
      if (source.endDate !== null && date > source.endDate) break
      if (isInRange(date, range) || (includeOverdueBefore && date < range.from)) {
        const occurrence = occurrenceStatus(source, date, transactions, today)
        if (occurrence.state !== 'received') result.push({ source, occurrence })
      }
      date = nextIncomeDate(source, date)
    }
  }
  return result.sort((a, b) => a.occurrence.dueDate.localeCompare(b.occurrence.dueDate))
}

/** Sum of expected (forecast) amounts per currency. Never mixed with received income. */
export function expectedTotalsByCurrency(items: readonly { occurrence: OccurrenceStatus }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const { occurrence } of items) map.set(occurrence.currency, addMinor(map.get(occurrence.currency) ?? 0, occurrence.remainingMinor))
  return map
}

/** Received income grouped by source (transactions without a source are grouped under null). */
export function incomeBySource(transactions: readonly Transaction[], currency: string): { sourceId: string | null; totalMinor: number }[] {
  const map = new Map<string | null, number>()
  for (const t of transactions) {
    if (t.type !== 'income' || t.currency !== currency) continue
    map.set(t.incomeSourceId, addMinor(map.get(t.incomeSourceId) ?? 0, t.amountMinor))
  }
  return [...map.entries()].map(([sourceId, totalMinor]) => ({ sourceId, totalMinor })).sort((a, b) => b.totalMinor - a.totalMinor)
}

/** Deterministic ID for one receipt; the n-th receipt of an occurrence gets its own ID. */
export function incomeReceiptId(sourceId: string, dueDate: IsoDate, sequence: number): string {
  return `inc_${sourceId}_${dueDate}_${sequence}`
}
