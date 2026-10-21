import type { Budget, IsoDate, IsoMonth, OpeningBalance, Transaction, TransactionType, WeekStart } from '@/domain/types'
import { bucketStart, eachBucket, isInRange, monthOf, monthRange, type DateRange, type Granularity } from './dates'
import { addMinor } from './money'

export interface CurrencyTotals {
  currency: string
  incomeMinor: number
  expenseMinor: number
  netMinor: number
  count: number
}

export function filterByRange<T extends { date: IsoDate }>(items: readonly T[], range: DateRange): T[] {
  return items.filter((item) => isInRange(item.date, range))
}

/**
 * Income/expense totals per currency. Amounts in different currencies are never added together.
 * Result is sorted with `preferredCurrency` first, then by number of transactions.
 */
export function totalsByCurrency(transactions: readonly Transaction[], preferredCurrency?: string): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>()
  for (const t of transactions) {
    let entry = map.get(t.currency)
    if (!entry) {
      entry = { currency: t.currency, incomeMinor: 0, expenseMinor: 0, netMinor: 0, count: 0 }
      map.set(t.currency, entry)
    }
    if (t.type === 'income') {
      entry.incomeMinor = addMinor(entry.incomeMinor, t.amountMinor)
      entry.netMinor = addMinor(entry.netMinor, t.amountMinor)
    } else {
      entry.expenseMinor = addMinor(entry.expenseMinor, t.amountMinor)
      entry.netMinor = addMinor(entry.netMinor, -t.amountMinor)
    }
    entry.count += 1
  }
  return [...map.values()].sort((a, b) => {
    if (a.currency === preferredCurrency) return -1
    if (b.currency === preferredCurrency) return 1
    return b.count - a.count || a.currency.localeCompare(b.currency)
  })
}

export function emptyTotals(currency: string): CurrencyTotals {
  return { currency, incomeMinor: 0, expenseMinor: 0, netMinor: 0, count: 0 }
}

/** Currencies that appear in the given transactions, preferred currency first. */
export function currenciesIn(transactions: readonly Transaction[], preferredCurrency?: string): string[] {
  return totalsByCurrency(transactions, preferredCurrency).map((t) => t.currency)
}

/**
 * Picks the currency to chart: the preferred currency when it has data, otherwise
 * the currency with the most transactions, otherwise the preferred currency.
 */
export function primaryCurrency(transactions: readonly Transaction[], preferredCurrency: string): string {
  const totals = totalsByCurrency(transactions, preferredCurrency)
  return totals[0]?.currency ?? preferredCurrency
}

export interface CategorySummary {
  categoryId: string
  totalMinor: number
  count: number
  /** Share of the total for this currency and type, 0–1. Display-only. */
  share: number
}

export function categoryBreakdown(
  transactions: readonly Transaction[],
  currency: string,
  type: TransactionType = 'expense',
): CategorySummary[] {
  const map = new Map<string, CategorySummary>()
  let grandTotal = 0
  for (const t of transactions) {
    if (t.currency !== currency || t.type !== type) continue
    let entry = map.get(t.categoryId)
    if (!entry) {
      entry = { categoryId: t.categoryId, totalMinor: 0, count: 0, share: 0 }
      map.set(t.categoryId, entry)
    }
    entry.totalMinor = addMinor(entry.totalMinor, t.amountMinor)
    entry.count += 1
    grandTotal = addMinor(grandTotal, t.amountMinor)
  }
  const result = [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor)
  for (const entry of result) entry.share = grandTotal === 0 ? 0 : entry.totalMinor / grandTotal
  return result
}

export interface TimeBucket {
  start: IsoDate
  incomeMinor: number
  expenseMinor: number
  netMinor: number
}

/** Income and expenses for one currency grouped into day/week/month buckets covering the range. */
export function timeSeries(
  transactions: readonly Transaction[],
  currency: string,
  range: DateRange,
  granularity: Granularity,
  weekStartsOn: WeekStart,
): TimeBucket[] {
  const buckets = new Map<IsoDate, TimeBucket>()
  for (const start of eachBucket(range, granularity, weekStartsOn)) {
    buckets.set(start, { start, incomeMinor: 0, expenseMinor: 0, netMinor: 0 })
  }
  for (const t of transactions) {
    if (t.currency !== currency || !isInRange(t.date, range)) continue
    const bucket = buckets.get(bucketStart(t.date, granularity, weekStartsOn))
    if (!bucket) continue
    if (t.type === 'income') {
      bucket.incomeMinor = addMinor(bucket.incomeMinor, t.amountMinor)
      bucket.netMinor = addMinor(bucket.netMinor, t.amountMinor)
    } else {
      bucket.expenseMinor = addMinor(bucket.expenseMinor, t.amountMinor)
      bucket.netMinor = addMinor(bucket.netMinor, -t.amountMinor)
    }
  }
  return [...buckets.values()]
}

export interface CurrencyBalance {
  currency: string
  openingMinor: number
  hasOpeningBalance: boolean
  balanceMinor: number
}

/**
 * Current balance per currency = recorded opening balance + income − expenses dated on or before `asOf`.
 * Future-dated transactions are excluded until their date arrives.
 */
export function balancesByCurrency(
  transactions: readonly Transaction[],
  openingBalances: readonly OpeningBalance[],
  asOf: IsoDate,
  preferredCurrency?: string,
): CurrencyBalance[] {
  const map = new Map<string, CurrencyBalance>()
  for (const opening of openingBalances) {
    map.set(opening.currency, {
      currency: opening.currency,
      openingMinor: opening.amountMinor,
      hasOpeningBalance: true,
      balanceMinor: opening.amountMinor,
    })
  }
  for (const t of transactions) {
    if (t.date > asOf) continue
    let entry = map.get(t.currency)
    if (!entry) {
      entry = { currency: t.currency, openingMinor: 0, hasOpeningBalance: false, balanceMinor: 0 }
      map.set(t.currency, entry)
    }
    entry.balanceMinor = addMinor(entry.balanceMinor, t.type === 'income' ? t.amountMinor : -t.amountMinor)
  }
  return [...map.values()].sort((a, b) => {
    if (a.currency === preferredCurrency) return -1
    if (b.currency === preferredCurrency) return 1
    return a.currency.localeCompare(b.currency)
  })
}

/** Percentage change from previous to current, or null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export const BUDGET_WARNING_THRESHOLD = 0.8

export type BudgetHealth = 'ok' | 'warning' | 'over'

export interface BudgetUsage {
  budgetId: string
  month: IsoMonth
  spentMinor: number
  remainingMinor: number
  /** Spent / limit as a ratio (0–∞). */
  ratio: number
  health: BudgetHealth
  transactionCount: number
  /** Expenses in the same category and month but a different currency; not counted. */
  otherCurrencyCount: number
}

export function budgetAppliesToMonth(budget: Pick<Budget, 'startMonth' | 'endMonth'>, month: IsoMonth): boolean {
  return month >= budget.startMonth && (budget.endMonth === null || month <= budget.endMonth)
}

/**
 * Spending against a monthly budget. Only expense transactions with the budget's category,
 * currency and month are counted; each transaction is counted at most once.
 */
export function budgetUsage(budget: Budget, transactions: readonly Transaction[], month: IsoMonth): BudgetUsage {
  const range = monthRange(month)
  const seen = new Set<string>()
  let spentMinor = 0
  let transactionCount = 0
  let otherCurrencyCount = 0
  const applies = budgetAppliesToMonth(budget, month)
  if (applies) {
    for (const t of transactions) {
      if (t.type !== 'expense' || t.categoryId !== budget.categoryId || !isInRange(t.date, range)) continue
      if (t.currency !== budget.currency) {
        otherCurrencyCount += 1
        continue
      }
      if (seen.has(t.id)) continue
      seen.add(t.id)
      spentMinor = addMinor(spentMinor, t.amountMinor)
      transactionCount += 1
    }
  }
  const ratio = budget.limitMinor > 0 ? spentMinor / budget.limitMinor : 0
  return {
    budgetId: budget.id,
    month,
    spentMinor,
    remainingMinor: budget.limitMinor - spentMinor,
    ratio,
    health: spentMinor > budget.limitMinor ? 'over' : ratio >= BUDGET_WARNING_THRESHOLD ? 'warning' : 'ok',
    transactionCount,
    otherCurrencyCount,
  }
}

/**
 * Two budgets conflict when they track the same category and currency in at least one common month.
 * Allowing that would count the same expenses against two limits.
 */
export function budgetsOverlap(
  a: Pick<Budget, 'categoryId' | 'currency' | 'startMonth' | 'endMonth'>,
  b: Pick<Budget, 'categoryId' | 'currency' | 'startMonth' | 'endMonth'>,
): boolean {
  if (a.categoryId !== b.categoryId || a.currency !== b.currency) return false
  const aEnd = a.endMonth ?? '9999-12'
  const bEnd = b.endMonth ?? '9999-12'
  return a.startMonth <= bEnd && b.startMonth <= aEnd
}

export function monthOfToday(today: IsoDate): IsoMonth {
  return monthOf(today)
}
