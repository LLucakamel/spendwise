import { CalendarClockIcon, PiggyBankIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { addMonthsToMonth, monthOf, todayIso } from '@/lib/dates'
import { budgetAppliesToMonth, budgetUsage, type BudgetHealth } from '@/lib/finance'
import { addMinor } from '@/lib/money'
import { approximateMonthlyCost, billsDueWithin, billTiming } from '@/lib/recurring'
import { cn } from '@/lib/utils'

export function HealthBadge({ health }: { health: BudgetHealth }) {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className={cn(health === 'over' && 'border-expense/40 text-expense', health === 'warning' && 'border-warning/40 text-warning', health === 'ok' && 'text-income')}
    >
      {t(`budgets.health.${health}`)}
    </Badge>
  )
}

/** How each budget performed this month and last month. */
export function BudgetPerformance() {
  const { budgets, transactions } = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const { t } = useI18n()
  const thisMonth = monthOf(todayIso())
  const lastMonth = addMonthsToMonth(thisMonth, -1)
  const rows = budgets.filter((b) => budgetAppliesToMonth(b, thisMonth) || budgetAppliesToMonth(b, lastMonth))
  const usageText = (spentMinor: number, ratio: number, currency: string) => `${format.money(spentMinor, currency)} (${format.number(Math.round(ratio * 100))}%)`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.budgetPerformance')}</CardTitle>
        <CardDescription>{t('analytics.budgetPerformanceText', { last: format.month(lastMonth), current: format.month(thisMonth) })}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState icon={PiggyBankIcon} title={t('analytics.noBudgets')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('analytics.budget')}</TableHead>
                <TableHead className="text-end">{t('analytics.lastMonth')}</TableHead>
                <TableHead className="text-end">{t('budgets.thisMonth')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => {
                const last = budgetAppliesToMonth(b, lastMonth) ? budgetUsage(b, transactions, lastMonth) : null
                const now = budgetAppliesToMonth(b, thisMonth) ? budgetUsage(b, transactions, thisMonth) : null
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <span className="block font-medium">{b.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('analytics.limitLine', { category: lookup.name(b.categoryId), limit: format.money(b.limitMinor, b.currency) })}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular">{last ? usageText(last.spentMinor, last.ratio, b.currency) : '—'}</TableCell>
                    <TableCell className="text-end tabular">{now ? usageText(now.spentMinor, now.ratio, b.currency) : '—'}</TableCell>
                    <TableCell>{now ? <HealthBadge health={now.health} /> : <span className="text-xs text-muted-foreground">{t('analytics.notActive')}</span>}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Active recurring commitments, by currency. */
export function RecurringSummary() {
  const { recurringBills } = useFinance()
  const format = useFormat()
  const { t } = useI18n()
  const today = todayIso()
  const active = recurringBills.filter((b) => b.status === 'active')
  const byCurrency = new Map<string, number>()
  for (const bill of active) byCurrency.set(bill.currency, addMinor(byCurrency.get(bill.currency) ?? 0, approximateMonthlyCost(bill)))
  const next30 = billsDueWithin(recurringBills, today, 30)
  const overdue = recurringBills.filter((b) => billTiming(b, today) === 'overdue').length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.recurring')}</CardTitle>
        <CardDescription>{t('analytics.recurringText')}</CardDescription>
      </CardHeader>
      <CardContent>
        {recurringBills.length === 0 ? (
          <EmptyState icon={CalendarClockIcon} title={t('analytics.noRecurring')} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('analytics.activePaused')}</dt>
              <dd className="text-lg font-semibold tabular">
                {format.number(active.length)} / {format.number(recurringBills.filter((b) => b.status === 'paused').length)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('bills.overdue')}</dt>
              <dd className="text-lg font-semibold tabular">{format.number(overdue)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('analytics.dueIn30')}</dt>
              <dd className="text-lg font-semibold tabular">{format.number(next30.length)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('bills.monthlyCost')}</dt>
              <dd className="font-semibold tabular">
                {[...byCurrency.entries()].map(([currency, minor]) => (
                  <span key={currency} className="block text-lg">
                    {format.money(minor, currency)}
                  </span>
                ))}
                {byCurrency.size === 0 ? '—' : null}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
