import type { Budget, IncomeSource, IsoDate, IsoMonth, RecurringBill, Transaction } from '@/domain/types'
import type { MessageKey } from '@/i18n'
import { budgetAppliesToMonth, budgetUsage, categoryBreakdown, percentChange, totalsByCurrency } from './finance'
import { expectedPayments } from './income'
import { billTiming } from './recurring'

export type InsightTone = 'positive' | 'warning' | 'neutral'

/** A rule-based observation, rendered with `t(insight.key, insight.vars)`. */
export interface Insight {
  id: string
  tone: InsightTone
  key: MessageKey
  vars: Record<string, string | number>
}

export interface InsightInput {
  currency: string
  periodTransactions: readonly Transaction[]
  comparisonTransactions: readonly Transaction[]
  allTransactions: readonly Transaction[]
  budgets: readonly Budget[]
  bills: readonly RecurringBill[]
  /** Income sources, used to report overdue expected payments. */
  incomeSources?: readonly IncomeSource[]
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
        key: 'insights.budgetOver',
        vars: { name: budget.name, amount: money(-usage.remainingMinor, budget.currency) },
      })
    } else if (usage.health === 'warning') {
      insights.push({
        id: `budget-near-${budget.id}`,
        tone: 'warning',
        key: 'insights.budgetNear',
        vars: { name: budget.name, percent: Math.round(usage.ratio * 100), amount: money(usage.remainingMinor, budget.currency) },
      })
    }
  }

  const overdue = input.bills.filter((b) => billTiming(b, input.today) === 'overdue')
  if (overdue.length === 1) {
    insights.push({ id: 'bills-overdue', tone: 'warning', key: 'insights.billOverdue', vars: { name: overdue[0]?.name ?? '' } })
  } else if (overdue.length > 1) {
    insights.push({ id: 'bills-overdue', tone: 'warning', key: 'insights.billsOverdue', vars: { count: overdue.length } })
  }

  if (input.incomeSources && input.incomeSources.length > 0) {
    // Everything due before today that hasn't been fully received.
    const range = { from: input.today, to: input.today }
    const overdueIncome = expectedPayments(input.incomeSources, input.allTransactions, range, input.today, true).filter(
      (p) => p.occurrence.overdue,
    )
    if (overdueIncome.length > 0) {
      insights.push({ id: 'income-overdue', tone: 'warning', key: 'insights.incomeOverdue', vars: { count: overdueIncome.length } })
    }
  }

  const breakdown = categoryBreakdown(input.periodTransactions, currency, 'expense')
  const top = breakdown[0]
  if (top && breakdown.length > 1) {
    insights.push({
      id: 'top-category',
      tone: 'neutral',
      key: 'insights.topCategory',
      vars: { category: categoryName(top.categoryId), amount: money(top.totalMinor, currency), percent: Math.round(top.share * 100), currency },
    })
  }

  if (current && previous && previous.expenseMinor > 0) {
    const change = percentChange(current.expenseMinor, previous.expenseMinor)
    if (change !== null && Math.abs(change) >= 5) {
      insights.push({
        id: 'spending-change',
        tone: change < 0 ? 'positive' : 'neutral',
        key: change < 0 ? 'insights.spentLess' : 'insights.spentMore',
        vars: { percent: Math.abs(Math.round(change)), currency },
      })
    }
  }

  if (current && current.incomeMinor > 0 && current.netMinor > 0) {
    insights.push({
      id: 'saved',
      tone: 'positive',
      key: 'insights.kept',
      vars: { percent: Math.round((current.netMinor / current.incomeMinor) * 100), currency },
    })
  }

  const largest = input.periodTransactions
    .filter((t) => t.type === 'expense' && t.currency === currency)
    .reduce<Transaction | null>((max, t) => (max === null || t.amountMinor > max.amountMinor ? t : max), null)
  if (largest && breakdown.length > 0) {
    insights.push({
      id: 'largest-expense',
      tone: 'neutral',
      key: 'insights.largest',
      vars: { name: largest.description, amount: money(largest.amountMinor, currency) },
    })
  }

  return insights.slice(0, 5)
}
