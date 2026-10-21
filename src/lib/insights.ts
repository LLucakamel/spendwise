import type { Budget, IsoDate, IsoMonth, RecurringBill, Transaction } from '@/domain/types'
import { budgetAppliesToMonth, budgetUsage, categoryBreakdown, percentChange, totalsByCurrency } from './finance'
import { billTiming } from './recurring'

export type InsightTone = 'positive' | 'warning' | 'neutral'

export interface Insight {
  id: string
  tone: InsightTone
  text: string
}

export interface InsightInput {
  currency: string
  periodTransactions: readonly Transaction[]
  comparisonTransactions: readonly Transaction[]
  allTransactions: readonly Transaction[]
  budgets: readonly Budget[]
  bills: readonly RecurringBill[]
  month: IsoMonth
  today: IsoDate
  categoryName(id: string): string
  money(minor: number, currency: string): string
}

/**
 * Rule-based observations calculated from the user's own records. Each rule is a plain
 * calculation (no prediction or AI) and only fires when there is enough data to support it.
 */
export function computeInsights(input: InsightInput): Insight[] {
  const { currency, money, categoryName } = input
  const insights: Insight[] = []
  const current = totalsByCurrency(input.periodTransactions).find((t) => t.currency === currency)
  const previous = totalsByCurrency(input.comparisonTransactions).find((t) => t.currency === currency)

  for (const budget of input.budgets) {
    if (!budgetAppliesToMonth(budget, input.month)) continue
    const usage = budgetUsage(budget, input.allTransactions, input.month)
    if (usage.health === 'over') {
      insights.push({
        id: `budget-over-${budget.id}`,
        tone: 'warning',
        text: `“${budget.name}” is over budget by ${money(-usage.remainingMinor, budget.currency)} this month.`,
      })
    } else if (usage.health === 'warning') {
      insights.push({
        id: `budget-near-${budget.id}`,
        tone: 'warning',
        text: `“${budget.name}” has used ${Math.round(usage.ratio * 100)}% of its monthly limit, with ${money(usage.remainingMinor, budget.currency)} left.`,
      })
    }
  }

  const overdue = input.bills.filter((b) => billTiming(b, input.today) === 'overdue')
  if (overdue.length > 0) {
    insights.push({
      id: 'bills-overdue',
      tone: 'warning',
      text: overdue.length === 1 ? `“${overdue[0]?.name}” is overdue.` : `${overdue.length} recurring bills are overdue.`,
    })
  }

  const breakdown = categoryBreakdown(input.periodTransactions, currency, 'expense')
  const top = breakdown[0]
  if (top && breakdown.length > 1) {
    insights.push({
      id: 'top-category',
      tone: 'neutral',
      text: `${categoryName(top.categoryId)} was your largest expense category: ${money(top.totalMinor, currency)} (${Math.round(top.share * 100)}% of ${currency} spending).`,
    })
  }

  if (current && previous && previous.expenseMinor > 0) {
    const change = percentChange(current.expenseMinor, previous.expenseMinor)
    if (change !== null && Math.abs(change) >= 5) {
      insights.push({
        id: 'spending-change',
        tone: change < 0 ? 'positive' : 'neutral',
        text: `You spent ${Math.abs(Math.round(change))}% ${change < 0 ? 'less' : 'more'} in ${currency} than in the comparison period.`,
      })
    }
  }

  if (current && current.incomeMinor > 0 && current.netMinor > 0) {
    insights.push({
      id: 'saved',
      tone: 'positive',
      text: `You kept ${Math.round((current.netMinor / current.incomeMinor) * 100)}% of your ${currency} income in this period.`,
    })
  }

  const largest = input.periodTransactions
    .filter((t) => t.type === 'expense' && t.currency === currency)
    .reduce<Transaction | null>((max, t) => (max === null || t.amountMinor > max.amountMinor ? t : max), null)
  if (largest && breakdown.length > 0) {
    insights.push({
      id: 'largest-expense',
      tone: 'neutral',
      text: `Largest single expense: “${largest.description}” for ${money(largest.amountMinor, currency)}.`,
    })
  }

  return insights.slice(0, 5)
}
