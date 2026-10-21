import { BarChart3Icon, InfoIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart'
import { TrendChart } from '@/components/charts/TrendChart'
import { Money } from '@/components/common/Money'
import { CategorySelect, CurrencySwitcher, PeriodPicker } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { usePeriod } from '@/hooks/use-period'
import { chooseGranularity, rangeLengthDays } from '@/lib/dates'
import {
  categoryBreakdown,
  currenciesIn,
  emptyTotals,
  filterByRange,
  percentChange,
  timeSeries,
  totalsByCurrency,
} from '@/lib/finance'
import { cn } from '@/lib/utils'
import { ConvertedTotal } from '@/components/common/ConvertedTotal'
import { BudgetPerformance, RecurringSummary } from './AnalyticsExtras'

function ChangeCell({ current, previous, higherIsGood }: { current: number; previous: number; higherIsGood: boolean }) {
  const change = percentChange(current, previous)
  if (change === null) return <span className="text-muted-foreground">—</span>
  const good = change === 0 ? null : change > 0 === higherIsGood
  return (
    <span className={cn('tabular', good === null ? '' : good ? 'text-income' : 'text-expense')}>
      {change > 0 ? '+' : ''}
      {change.toFixed(1)}%
    </span>
  )
}

export function AnalyticsPage() {
  const { transactions, settings } = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const period = usePeriod('last-90-days', settings.weekStartsOn)
  const [categoryId, setCategoryId] = useState('')
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null)

  const scoped = useMemo(
    () => (categoryId ? transactions.filter((t) => t.categoryId === categoryId) : transactions),
    [transactions, categoryId],
  )
  const inPeriod = useMemo(() => filterByRange(scoped, period.range), [scoped, period.range])
  const inComparison = useMemo(() => filterByRange(scoped, period.comparison), [scoped, period.comparison])
  const currencies = useMemo(() => {
    const list = currenciesIn(inPeriod, settings.displayCurrency)
    return list.length ? list : [settings.displayCurrency]
  }, [inPeriod, settings.displayCurrency])
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : (currencies[0] ?? settings.displayCurrency)

  const totalsAll = useMemo(() => totalsByCurrency(inPeriod, settings.displayCurrency), [inPeriod, settings.displayCurrency])
  const previousAll = useMemo(() => totalsByCurrency(inComparison), [inComparison])
  const totals = totalsAll.find((t) => t.currency === currency) ?? emptyTotals(currency)
  const previous = previousAll.find((t) => t.currency === currency) ?? emptyTotals(currency)

  const granularity = chooseGranularity(period.range)
  const series = useMemo(
    () => timeSeries(inPeriod, currency, period.range, granularity, settings.weekStartsOn),
    [inPeriod, currency, period.range, granularity, settings.weekStartsOn],
  )
  const monthly = useMemo(
    () => timeSeries(inPeriod, currency, period.range, 'month', settings.weekStartsOn).filter((m) => m.incomeMinor || m.expenseMinor),
    [inPeriod, currency, period.range, settings.weekStartsOn],
  )
  const breakdown = useMemo(() => categoryBreakdown(inPeriod, currency, 'expense'), [inPeriod, currency])
  const previousBreakdown = useMemo(() => new Map(categoryBreakdown(inComparison, currency, 'expense').map((c) => [c.categoryId, c])), [inComparison, currency])
  const expenseBuckets = series.filter((b) => b.expenseMinor > 0).length
  const enoughForTrend = expenseBuckets >= 2

  return (
    <>
      <PageHeader title="Analytics" description="Explore trends, categories and period comparisons. Every figure is calculated from your recorded transactions." />

      <Card className="mb-5 py-4">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            <PeriodPicker value={period} onPresetChange={period.setPreset} onCustomChange={period.setCustomRange} />
            <div className="grid gap-1">
              <Label htmlFor="analytics-category" className="text-xs text-muted-foreground">
                Category
              </Label>
              <CategorySelect id="analytics-category" allowAll value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48" />
            </div>
          </div>
          <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosenCurrency} label="Currency shown" />
        </CardContent>
      </Card>

      <p className="mb-4 text-sm text-muted-foreground">
        {format.range(period.range)} ({rangeLengthDays(period.range)} days) compared with {format.range(period.comparison)}
        {categoryId ? ` · ${lookup.name(categoryId)} only` : ''} · {currency}
      </p>

      {inPeriod.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3Icon}
            title="No transactions in this period"
            description="Choose a longer period or a different category. Analytics only use transactions you’ve recorded — nothing is estimated."
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Period comparison</CardTitle>
              <CardDescription>
                This period vs the previous one, in {currency}. {previous.count === 0 ? 'There are no transactions in the previous period, so changes can’t be calculated.' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Measure</TableHead>
                    <TableHead className="text-right">This period</TableHead>
                    <TableHead className="text-right">Previous period</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Income</TableCell>
                    <TableCell className="text-right"><Money minor={totals.incomeMinor} currency={currency} /></TableCell>
                    <TableCell className="text-right"><Money minor={previous.incomeMinor} currency={currency} /></TableCell>
                    <TableCell className="text-right"><ChangeCell current={totals.incomeMinor} previous={previous.incomeMinor} higherIsGood /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Expenses</TableCell>
                    <TableCell className="text-right"><Money minor={totals.expenseMinor} currency={currency} /></TableCell>
                    <TableCell className="text-right"><Money minor={previous.expenseMinor} currency={currency} /></TableCell>
                    <TableCell className="text-right"><ChangeCell current={totals.expenseMinor} previous={previous.expenseMinor} higherIsGood={false} /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Net cash flow</TableCell>
                    <TableCell className="text-right"><Money minor={totals.netMinor} currency={currency} tone="signed" /></TableCell>
                    <TableCell className="text-right"><Money minor={previous.netMinor} currency={currency} tone="signed" /></TableCell>
                    <TableCell className="text-right"><ChangeCell current={totals.netMinor} previous={previous.netMinor} higherIsGood /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Transactions</TableCell>
                    <TableCell className="text-right tabular">{totals.count}</TableCell>
                    <TableCell className="text-right tabular">{previous.count}</TableCell>
                    <TableCell className="text-right"><span className="text-muted-foreground">—</span></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Income vs expenses</CardTitle>
                <CardDescription>{currency}, by {granularity}</CardDescription>
              </CardHeader>
              <CardContent>
                {totals.count === 0 ? (
                  <EmptyState icon={BarChart3Icon} title={`No ${currency} transactions in this period`} />
                ) : (
                  <IncomeExpenseChart buckets={series} currency={currency} granularity={granularity} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Spending trend</CardTitle>
                <CardDescription>{currency} expenses by {granularity}{categoryId ? ` · ${lookup.name(categoryId)}` : ''}</CardDescription>
              </CardHeader>
              <CardContent>
                {enoughForTrend ? (
                  <TrendChart buckets={series} currency={currency} granularity={granularity} seriesLabel="Expenses" />
                ) : (
                  <EmptyState
                    icon={InfoIcon}
                    title="Not enough data for a trend"
                    description={`A trend needs expenses in at least two different ${granularity}s of the selected period.`}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expenses by category</CardTitle>
                <CardDescription>Share of {currency} spending in this period</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdown.length === 0 ? (
                  <EmptyState icon={BarChart3Icon} title="No expenses in this period" />
                ) : (
                  <CategoryBars items={breakdown} currency={currency} limit={8} linkParams={{ from: period.range.from, to: period.range.to }} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top spending categories</CardTitle>
                <CardDescription>Compared with the previous period</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {breakdown.length === 0 ? (
                  <EmptyState icon={BarChart3Icon} title="No expenses in this period" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">This period</TableHead>
                        <TableHead className="text-right">Previous</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {breakdown.slice(0, 5).map((c) => {
                        const prev = previousBreakdown.get(c.categoryId)?.totalMinor ?? 0
                        return (
                          <TableRow key={c.categoryId}>
                            <TableCell>
                              <span className="inline-flex items-center gap-2">
                                <span className="size-2.5 rounded-full" style={{ backgroundColor: lookup.color(c.categoryId) }} aria-hidden="true" />
                                {lookup.name(c.categoryId)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right"><Money minor={c.totalMinor} currency={currency} /></TableCell>
                            <TableCell className="text-right"><Money minor={prev} currency={currency} /></TableCell>
                            <TableCell className="text-right"><ChangeCell current={c.totalMinor} previous={prev} higherIsGood={false} /></TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly summary</CardTitle>
              <CardDescription>{currency} totals for each month in the selected period (partial months included as recorded)</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {monthly.length === 0 ? (
                <EmptyState icon={BarChart3Icon} title={`No ${currency} activity in this period`} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Saved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthly.map((m) => (
                      <TableRow key={m.start}>
                        <TableCell>{format.month(m.start.slice(0, 7))}</TableCell>
                        <TableCell className="text-right"><Money minor={m.incomeMinor} currency={currency} /></TableCell>
                        <TableCell className="text-right"><Money minor={m.expenseMinor} currency={currency} /></TableCell>
                        <TableCell className="text-right"><Money minor={m.netMinor} currency={currency} tone="signed" /></TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">
                          {m.incomeMinor > 0 ? `${Math.round((m.netMinor / m.incomeMinor) * 100)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals by currency</CardTitle>
              <CardDescription>Each currency is totalled separately. SpendWise does not convert between currencies.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totalsAll.map((t) => (
                    <TableRow key={t.currency}>
                      <TableCell className="font-medium">{t.currency}</TableCell>
                      <TableCell className="text-right"><Money minor={t.incomeMinor} currency={t.currency} /></TableCell>
                      <TableCell className="text-right"><Money minor={t.expenseMinor} currency={t.currency} /></TableCell>
                      <TableCell className="text-right"><Money minor={t.netMinor} currency={t.currency} tone="signed" /></TableCell>
                      <TableCell className="text-right tabular">{t.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {totalsAll.length > 1 ? (
            <ConvertedTotal
              title="Net cash flow across currencies"
              target={settings.displayCurrency}
              amounts={totalsAll.map((t) => ({ currency: t.currency, amountMinor: t.netMinor }))}
            />
          ) : null}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BudgetPerformance />
        <RecurringSummary />
      </div>
    </>
  )
}
