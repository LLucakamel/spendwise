import { CalendarClockIcon, PiggyBankIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import { BudgetHealthBadge } from '@/features/budgets/budgetUi'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { addMonthsToMonth, monthOf, todayIso } from '@/lib/dates'
import { budgetAppliesToMonth, budgetUsage } from '@/lib/finance'
import { addMinor } from '@/lib/money'
import { approximateMonthlyCost, billsDueWithin, billTiming } from '@/lib/recurring'

/** How each budget performed this month and last month. */
export function BudgetPerformance() {
  const { budgets, transactions } = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const thisMonth = monthOf(todayIso())
  const lastMonth = addMonthsToMonth(thisMonth, -1)
  const rows = budgets.filter((b) => budgetAppliesToMonth(b, thisMonth) || budgetAppliesToMonth(b, lastMonth))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget performance</CardTitle>
        <CardDescription>
          {format.month(lastMonth)} and {format.month(thisMonth)} (month to date), in each budget’s own currency
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState icon={PiggyBankIcon} title="No budgets in these months" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead className="text-right">Last month</TableHead>
                <TableHead className="text-right">This month</TableHead>
                <TableHead>Status</TableHead>
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
                        {lookup.name(b.categoryId)} · limit {format.money(b.limitMinor, b.currency)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{last ? `${format.money(last.spentMinor, b.currency)} (${Math.round(last.ratio * 100)}%)` : '—'}</TableCell>
                    <TableCell className="text-right tabular">{now ? `${format.money(now.spentMinor, b.currency)} (${Math.round(now.ratio * 100)}%)` : '—'}</TableCell>
                    <TableCell>{now ? <BudgetHealthBadge health={now.health} /> : <span className="text-xs text-muted-foreground">Not active</span>}</TableCell>
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
  const today = todayIso()
  const active = recurringBills.filter((b) => b.status === 'active')
  const byCurrency = new Map<string, number>()
  for (const bill of active) byCurrency.set(bill.currency, addMinor(byCurrency.get(bill.currency) ?? 0, approximateMonthlyCost(bill)))
  const next30 = billsDueWithin(recurringBills, today, 30)
  const overdue = recurringBills.filter((b) => billTiming(b, today) === 'overdue').length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring commitments</CardTitle>
        <CardDescription>Scheduled bills — these are not expenses until you mark them paid</CardDescription>
      </CardHeader>
      <CardContent>
        {recurringBills.length === 0 ? (
          <EmptyState icon={CalendarClockIcon} title="No recurring bills" />
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Active / paused</dt>
              <dd className="text-lg font-semibold tabular">
                {active.length} / {recurringBills.filter((b) => b.status === 'paused').length}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Overdue</dt>
              <dd className="text-lg font-semibold tabular">{overdue}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Due in the next 30 days</dt>
              <dd className="text-lg font-semibold tabular">{next30.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Approx. per month</dt>
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
