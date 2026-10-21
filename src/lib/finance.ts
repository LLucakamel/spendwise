import type { Account, Budget, IsoDate, IsoMonth, OpeningBalance, Transaction, WeekStart } from '@/domain/types'
import { bucketStart, eachBucket, isInRange, monthRange, type DateRange, type Granularity } from './dates'
import { addMinor } from './money'

/**
 * Every total in SpendWise is computed here, per currency. The rules:
 * - income adds to income;
 * - expense adds to expenses; refund subtracts from expenses (it is never income);
 * - transfer (between the user's own accounts, including card repayments) is ignored.
 */
export interface CurrencyTotals {
  currency: string
  incomeMinor: number
  /** Expenses net of refunds. */
  expenseMinor: number
  refundMinor: number
  netMinor: number
  count: number
}

export function filterByRange<T extends { date: IsoDate }>(items: readonly T[], range: DateRange): T[] {
  return items.filter((item) => isInRange(item.date, range))
}

/** Signed effect of a transaction on income/expense totals, or null for transfers. */
export function flowOf(t: Pick<Transaction, 'type' | 'amountMinor'>): { income: number; expense: number } | null {
  switch (t.type) {
    case 'income':
      return { income: t.amountMinor, expense: 0 }
    case 'expense':
      return { income: 0, expense: t.amountMinor }
    case 'refund':
      return { income: 0, expense: -t.amountMinor }
    case 'transfer':
      return null
  }
}

export function totalsByCurrency(transactions: readonly Transaction[], preferredCurrency?: string): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>()
  for (const t of transactions) {
    const flow = flowOf(t)
    if (!flow) continue
    let entry = map.get(t.currency)
    if (!entry) {
      entry = emptyTotals(t.currency)
      map.set(t.currency, entry)
    }
    entry.incomeMinor = addMinor(entry.incomeMinor, flow.income)
    entry.expenseMinor = addMinor(entry.expenseMinor, flow.expense)
    if (t.type === 'refund') entry.refundMinor = addMinor(entry.refundMinor, t.amountMinor)
    entry.netMinor = addMinor(entry.netMinor, flow.income - flow.expense)
    entry.count += 1
  }
  return [...map.values()].sort((a, b) => {
    if (a.currency === preferredCurrency) return -1
    if (b.currency === preferredCurrency) return 1
    return b.count - a.count || a.currency.localeCompare(b.currency)
  })
}

export function emptyTotals(currency: string): CurrencyTotals {
  return { currency, incomeMinor: 0, expenseMinor: 0, refundMinor: 0, netMinor: 0, count: 0 }
}

/** Currencies that appear in income/expense activity, preferred currency first. */
export function currenciesIn(transactions: readonly Transaction[], preferredCurrency?: string): string[] {
  return totalsByCurrency(transactions, preferredCurrency).map((t) => t.currency)
}

export function primaryCurrency(transactions: readonly Transaction[], preferredCurrency: string): string {
  return totalsByCurrency(transactions, preferredCurrency)[0]?.currency ?? preferredCurrency
}

export interface CategorySummary {
  categoryId: string
  totalMinor: number
  count: number
  /** Share of the total for this currency and type, 0–1. Display-only. */
  share: number
}

/**
 * Totals per category for one currency. For expenses, refunds are subtracted from their
 * category; categories whose refunds cancel all spending are omitted.
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  currency: string,
  type: 'income' | 'expense' = 'expense',
): CategorySummary[] {
  const map = new Map<string, CategorySummary>()
  for (const t of transactions) {
    if (t.currency !== currency) continue
    let delta: number
    if (type === 'income') {
      if (t.type !== 'income') continue
      delta = t.amountMinor
    } else if (t.type === 'expense') delta = t.amountMinor
    else if (t.type === 'refund') delta = -t.amountMinor
    else continue
    let entry = map.get(t.categoryId)
    if (!entry) {
      entry = { categoryId: t.categoryId, totalMinor: 0, count: 0, share: 0 }
      map.set(t.categoryId, entry)
    }
    entry.totalMinor = addMinor(entry.totalMinor, delta)
    entry.count += 1
  }
  const result = [...map.values()].filter((e) => e.totalMinor > 0).sort((a, b) => b.totalMinor - a.totalMinor)
  const grandTotal = result.reduce((sum, e) => addMinor(sum, e.totalMinor), 0)
  for (const entry of result) entry.share = grandTotal === 0 ? 0 : entry.totalMinor / grandTotal
  return result
}

export interface TimeBucket {
  start: IsoDate
  incomeMinor: number
  expenseMinor: number
  netMinor: number
}

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
    const flow = flowOf(t)
    if (!flow) continue
    const bucket = buckets.get(bucketStart(t.date, granularity, weekStartsOn))
    if (!bucket) continue
    bucket.incomeMinor = addMinor(bucket.incomeMinor, flow.income)
    bucket.expenseMinor = addMinor(bucket.expenseMinor, flow.expense)
    bucket.netMinor = addMinor(bucket.netMinor, flow.income - flow.expense)
  }
  return [...buckets.values()]
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export interface AccountBalance {
  accountId: string
  currency: string
  balanceMinor: number
  /** For credit cards: amount owed (positive), otherwise null. */
  owedMinor: number | null
  /** For credit cards with a limit: limit − owed. Null when it can't be calculated. */
  availableCreditMinor: number | null
}

/** Signed effect of a transaction on one account's balance. */
export function accountDelta(t: Transaction, accountId: string): number {
  switch (t.type) {
    case 'income':
    case 'refund':
      return t.accountId === accountId ? t.amountMinor : 0
    case 'expense':
      return t.accountId === accountId ? -t.amountMinor : 0
    case 'transfer':
      return (t.toAccountId === accountId ? t.amountMinor : 0) - (t.accountId === accountId ? t.amountMinor : 0)
  }
}

/**
 * Recorded balance of each account: opening balance plus every transaction dated on or before
 * `asOf`. These are balances of what was recorded in SpendWise, not live bank balances.
 */
export function accountBalances(accounts: readonly Account[], transactions: readonly Transaction[], asOf: IsoDate): AccountBalance[] {
  return accounts.map((account) => {
    let balance = account.openingBalanceMinor
    for (const t of transactions) {
      if (t.date > asOf || t.currency !== account.currency) continue
      if (t.accountId !== account.id && t.toAccountId !== account.id) continue
      balance = addMinor(balance, accountDelta(t, account.id))
    }
    const isCard = account.kind === 'credit-card'
    const owed = isCard ? Math.max(0, -balance) : null
    return {
      accountId: account.id,
      currency: account.currency,
      balanceMinor: balance,
      owedMinor: owed,
      availableCreditMinor: isCard && account.creditLimitMinor !== null && owed !== null ? account.creditLimitMinor - owed : null,
    }
  })
}

export interface CurrencyBalance {
  currency: string
  openingMinor: number
  hasOpeningBalance: boolean
  balanceMinor: number
}

/**
 * Overall recorded balance per currency = unassigned opening balances + account opening balances
 * + income + refunds − expenses dated on or before `asOf`. Transfers between own accounts net to zero,
 * so card repayments are never counted twice. Credit-card debt lowers this balance.
 */
export function balancesByCurrency(
  transactions: readonly Transaction[],
  openingBalances: readonly OpeningBalance[],
  asOf: IsoDate,
  preferredCurrency?: string,
  accounts: readonly Account[] = [],
): CurrencyBalance[] {
  const map = new Map<string, CurrencyBalance>()
  const touch = (currency: string) => {
    let entry = map.get(currency)
    if (!entry) {
      entry = { currency, openingMinor: 0, hasOpeningBalance: false, balanceMinor: 0 }
      map.set(currency, entry)
    }
    return entry
  }
  for (const opening of openingBalances) {
    const entry = touch(opening.currency)
    entry.openingMinor = addMinor(entry.openingMinor, opening.amountMinor)
    entry.balanceMinor = addMinor(entry.balanceMinor, opening.amountMinor)
    entry.hasOpeningBalance = true
  }
  for (const account of accounts) {
    if (account.archived && account.openingBalanceMinor === 0) continue
    const entry = touch(account.currency)
    entry.openingMinor = addMinor(entry.openingMinor, account.openingBalanceMinor)
    entry.balanceMinor = addMinor(entry.balanceMinor, account.openingBalanceMinor)
    entry.hasOpeningBalance = true
  }
  for (const t of transactions) {
    if (t.date > asOf) continue
    const flow = flowOf(t)
    if (!flow) continue
    const entry = touch(t.currency)
    entry.balanceMinor = addMinor(entry.balanceMinor, flow.income - flow.expense)
  }
  return [...map.values()].sort((a, b) => {
    if (a.currency === preferredCurrency) return -1
    if (b.currency === preferredCurrency) return 1
    return a.currency.localeCompare(b.currency)
  })
}

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
  ratio: number
  health: BudgetHealth
  transactionCount: number
  otherCurrencyCount: number
}

export function budgetAppliesToMonth(budget: Pick<Budget, 'startMonth' | 'endMonth'>, month: IsoMonth): boolean {
  return month >= budget.startMonth && (budget.endMonth === null || month <= budget.endMonth)
}

/**
 * Spending against a monthly budget: expenses minus refunds with the budget's category, currency
 * and month. Income and transfers never count; each transaction counts at most once.
 */
export function budgetUsage(budget: Budget, transactions: readonly Transaction[], month: IsoMonth): BudgetUsage {
  const range = monthRange(month)
  const seen = new Set<string>()
  let spentMinor = 0
  let transactionCount = 0
  let otherCurrencyCount = 0
  if (budgetAppliesToMonth(budget, month)) {
    for (const t of transactions) {
      if ((t.type !== 'expense' && t.type !== 'refund') || t.categoryId !== budget.categoryId || !isInRange(t.date, range)) continue
      if (t.currency !== budget.currency) {
        otherCurrencyCount += 1
        continue
      }
      if (seen.has(t.id)) continue
      seen.add(t.id)
      spentMinor = addMinor(spentMinor, t.type === 'expense' ? t.amountMinor : -t.amountMinor)
      transactionCount += 1
    }
  }
  spentMinor = Math.max(0, spentMinor)
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

export function budgetsOverlap(
  a: Pick<Budget, 'categoryId' | 'currency' | 'startMonth' | 'endMonth'>,
  b: Pick<Budget, 'categoryId' | 'currency' | 'startMonth' | 'endMonth'>,
): boolean {
  if (a.categoryId !== b.categoryId || a.currency !== b.currency) return false
  const aEnd = a.endMonth ?? '9999-12'
  const bEnd = b.endMonth ?? '9999-12'
  return a.startMonth <= bEnd && b.startMonth <= aEnd
}
