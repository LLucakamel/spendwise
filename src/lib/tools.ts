import { addDays } from 'date-fns'
import type { Account, Debt, IncomeSource, Invoice, IsoDate, RecurringBill, SavingsGoal, Transaction } from '@/domain/types'
import { fromIsoDate, isInRange, toIsoDate, type DateRange } from './dates'
import { expectedPayments } from './income'
import { addMinor } from './money'
import { upcomingDueDates } from './recurring'

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

export function goalProgress(goal: SavingsGoal, today: IsoDate) {
  const saved = goal.contributions.reduce((s, c) => addMinor(s, c.amountMinor), 0)
  const remaining = Math.max(0, goal.targetMinor - saved)
  let monthlyNeeded: number | null = null
  if (goal.targetDate && remaining > 0) {
    const months = monthsBetween(today, goal.targetDate)
    monthlyNeeded = months > 0 ? Math.ceil(remaining / months) : remaining
  }
  return { savedMinor: saved, remainingMinor: remaining, ratio: goal.targetMinor > 0 ? saved / goal.targetMinor : 0, monthlyNeeded }
}

export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const a = fromIsoDate(from)
  const b = fromIsoDate(to)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1)
}

/** Average monthly expenses (net of refunds) in one currency over the last `months` full months. */
export function averageMonthlyExpenses(transactions: readonly Transaction[], currency: string, today: IsoDate, months = 3): number | null {
  const end = fromIsoDate(today)
  const from = new Date(end.getFullYear(), end.getMonth() - months, 1)
  const to = new Date(end.getFullYear(), end.getMonth(), 0)
  const range = { from: toIsoDate(from), to: toIsoDate(to) }
  let total = 0
  let any = false
  for (const t of transactions) {
    if (t.currency !== currency || !isInRange(t.date, range)) continue
    if (t.type === 'expense') total = addMinor(total, t.amountMinor)
    else if (t.type === 'refund') total = addMinor(total, -t.amountMinor)
    else continue
    any = true
  }
  return any ? Math.round(Math.max(0, total) / months) : null
}

// ---------------------------------------------------------------------------
// Debts and card payoff
// ---------------------------------------------------------------------------

export function debtOutstanding(debt: Debt): number {
  return Math.max(0, debt.originalMinor - debt.payments.reduce((s, p) => addMinor(s, p.amountMinor), 0))
}

export interface PayoffEstimate {
  months: number | null
  totalInterestMinor: number | null
  /** The payment doesn't cover the monthly interest, so the balance never falls. */
  neverPaysOff: boolean
}

/**
 * Estimated payoff with a fixed monthly payment and monthly compounding at `annualRatePercent`.
 * An estimate only: real card interest depends on the issuer's terms, fees and dates.
 */
export function payoffEstimate(balanceMinor: number, annualRatePercent: number, monthlyPaymentMinor: number): PayoffEstimate {
  if (balanceMinor <= 0) return { months: 0, totalInterestMinor: 0, neverPaysOff: false }
  if (monthlyPaymentMinor <= 0 || !Number.isFinite(annualRatePercent) || annualRatePercent < 0) return { months: null, totalInterestMinor: null, neverPaysOff: false }
  const r = annualRatePercent / 100 / 12
  let balance = balanceMinor
  let interest = 0
  for (let month = 1; month <= 600; month++) {
    const charge = Math.round(balance * r)
    if (month === 1 && charge >= monthlyPaymentMinor) return { months: null, totalInterestMinor: null, neverPaysOff: true }
    interest += charge
    balance = balance + charge - monthlyPaymentMinor
    if (balance <= 0) return { months: month, totalInterestMinor: interest, neverPaysOff: false }
  }
  return { months: null, totalInterestMinor: null, neverPaysOff: true }
}

// ---------------------------------------------------------------------------
// Financial calendar and forecast
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  date: IsoDate
  kind: 'bill' | 'income' | 'invoice-due' | 'card-due' | 'warranty' | 'return'
  title: string
  amountMinor: number | null
  currency: string | null
  refId: string
}

/** Upcoming dated items across the app. Forecast items (bills, expected income) are labelled as such in the UI. */
export function calendarEvents(
  data: { recurringBills: RecurringBill[]; incomeSources: IncomeSource[]; invoices: Invoice[]; accounts: Account[]; transactions: Transaction[] },
  range: DateRange,
  today: IsoDate,
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  for (const bill of data.recurringBills) {
    if (bill.status !== 'active') continue
    for (const date of upcomingDueDates(bill, 60)) {
      if (date > range.to) break
      if (date >= range.from) events.push({ date, kind: 'bill', title: bill.name, amountMinor: bill.amountMinor, currency: bill.currency, refId: bill.id })
    }
  }
  for (const { source, occurrence } of expectedPayments(data.incomeSources, data.transactions, range, today)) {
    events.push({ date: occurrence.dueDate, kind: 'income', title: source.name, amountMinor: occurrence.remainingMinor, currency: source.currency, refId: source.id })
  }
  for (const inv of data.invoices) {
    if (inv.status === 'paid' || inv.status === 'cancelled') continue
    if (inv.dueDate && isInRange(inv.dueDate, range)) events.push({ date: inv.dueDate, kind: 'invoice-due', title: inv.merchant || inv.invoiceNumber, amountMinor: inv.totalMinor, currency: inv.currency, refId: inv.id })
  }
  for (const inv of data.invoices) {
    if (inv.warrantyUntil && isInRange(inv.warrantyUntil, range)) events.push({ date: inv.warrantyUntil, kind: 'warranty', title: inv.merchant, amountMinor: null, currency: null, refId: inv.id })
    if (inv.returnBy && isInRange(inv.returnBy, range)) events.push({ date: inv.returnBy, kind: 'return', title: inv.merchant, amountMinor: null, currency: null, refId: inv.id })
  }
  for (const account of data.accounts) {
    if (account.kind !== 'credit-card' || account.paymentDueDay === null || account.archived) continue
    const cursor = fromIsoDate(range.from)
    for (let i = 0; i < 3; i++) {
      const month = new Date(cursor.getFullYear(), cursor.getMonth() + i, 1)
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      const date = toIsoDate(new Date(month.getFullYear(), month.getMonth(), Math.min(account.paymentDueDay, last)))
      if (isInRange(date, range)) events.push({ date, kind: 'card-due', title: account.name, amountMinor: account.minimumPaymentMinor, currency: account.currency, refId: account.id })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

export interface ForecastPoint {
  date: IsoDate
  balanceMinor: number
}

/**
 * Estimated balance path for one currency: today's recorded balance, plus expected income,
 * minus scheduled bills. It ignores everyday spending and anything not scheduled — an estimate.
 */
export function cashFlowForecast(
  startBalanceMinor: number,
  currency: string,
  data: { recurringBills: RecurringBill[]; incomeSources: IncomeSource[]; transactions: Transaction[] },
  today: IsoDate,
  days = 90,
): { points: ForecastPoint[]; incomeMinor: number; billsMinor: number } {
  const range = { from: today, to: toIsoDate(addDays(fromIsoDate(today), days)) }
  const deltas = new Map<IsoDate, number>()
  let incomeMinor = 0
  let billsMinor = 0
  for (const bill of data.recurringBills) {
    if (bill.status !== 'active' || bill.currency !== currency) continue
    for (const date of upcomingDueDates(bill, 120)) {
      if (date > range.to) break
      const effective = date < today ? today : date
      deltas.set(effective, (deltas.get(effective) ?? 0) - bill.amountMinor)
      billsMinor = addMinor(billsMinor, bill.amountMinor)
    }
  }
  for (const { occurrence } of expectedPayments(data.incomeSources, data.transactions, range, today, true)) {
    if (occurrence.currency !== currency) continue
    const effective = occurrence.dueDate < today ? today : occurrence.dueDate
    deltas.set(effective, (deltas.get(effective) ?? 0) + occurrence.remainingMinor)
    incomeMinor = addMinor(incomeMinor, occurrence.remainingMinor)
  }
  const points: ForecastPoint[] = []
  let balance = startBalanceMinor
  for (let d = fromIsoDate(today); toIsoDate(d) <= range.to; d = addDays(d, 1)) {
    const date = toIsoDate(d)
    balance = addMinor(balance, deltas.get(date) ?? 0)
    points.push({ date, balanceMinor: balance })
  }
  return { points, incomeMinor, billsMinor }
}

// ---------------------------------------------------------------------------
// Data quality and suggestions
// ---------------------------------------------------------------------------

export interface QualityIssue {
  kind: 'uncategorized' | 'possible-duplicate' | 'no-account' | 'unlinked-invoice' | 'future-dated'
  count: number
  sampleIds: string[]
}

export function dataQuality(transactions: readonly Transaction[], categoryIds: ReadonlySet<string>, invoices: readonly Invoice[], hasAccounts: boolean, today: IsoDate): QualityIssue[] {
  const issues: QualityIssue[] = []
  const uncategorized = transactions.filter((t) => t.type !== 'transfer' && !categoryIds.has(t.categoryId))
  if (uncategorized.length) issues.push({ kind: 'uncategorized', count: uncategorized.length, sampleIds: uncategorized.slice(0, 5).map((t) => t.id) })
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const key = `${t.date}|${t.amountMinor}|${t.currency}|${t.type}|${t.description.trim().toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1)
  if (dupes.length) issues.push({ kind: 'possible-duplicate', count: dupes.length, sampleIds: dupes.slice(0, 5).flatMap((g) => g.map((t) => t.id)) })
  if (hasAccounts) {
    const noAccount = transactions.filter((t) => t.accountId === null)
    if (noAccount.length) issues.push({ kind: 'no-account', count: noAccount.length, sampleIds: noAccount.slice(0, 5).map((t) => t.id) })
  }
  const unlinked = invoices.filter((i) => i.status === 'paid' && i.linkedTransactionIds.length === 0)
  if (unlinked.length) issues.push({ kind: 'unlinked-invoice', count: unlinked.length, sampleIds: unlinked.slice(0, 5).map((i) => i.id) })
  const future = transactions.filter((t) => t.date > today)
  if (future.length) issues.push({ kind: 'future-dated', count: future.length, sampleIds: future.slice(0, 5).map((t) => t.id) })
  return issues
}

/**
 * Suggests a category for a new description from the user's own history: the category used most
 * often for earlier transactions whose description shares the first meaningful word.
 */
export function suggestCategory(description: string, type: 'income' | 'expense', transactions: readonly Transaction[]): string | null {
  const words = description.toLocaleLowerCase().split(/\s+/).filter((w) => w.length >= 3)
  const first = words[0]
  if (!first) return null
  const counts = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== type) continue
    if (!t.description.toLocaleLowerCase().includes(first)) continue
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return best && best[1] >= 2 ? best[0] : null
}
