import { BarChart3Icon, InfoIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart'
import { TrendChart } from '@/components/charts/TrendChart'
import { ConvertedTotal } from '@/components/common/ConvertedTotal'
import { Money } from '@/components/common/Money'
import { CategorySelect, CurrencySwitcher, PeriodPicker } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { usePeriod } from '@/hooks/use-period'
import { useI18n, type MessageKey } from '@/i18n'
import { chooseGranularity, formatBucketLabel, rangeLengthDays, type Granularity } from '@/lib/dates'
import { categoryBreakdown, currenciesIn, emptyTotals, filterByRange, percentChange, timeSeries, totalsByCurrency } from '@/lib/finance'
import { cn } from '@/lib/utils'
import { BudgetPerformance, RecurringSummary } from './AnalyticsExtras'

const GRANULARITY_KEYS: Record<Granularity, MessageKey> = { day: 'periods.byDay', week: 'periods.byWeek', month: 'periods.byMonth' }

function ChangeCell({ current, previous, higherIsGood }: { current: number; previous: number; higherIsGood: boolean }) {
  const format = useFormat()
  const change = percentChange(current, previous)
  if (change === null) return <span className="text-muted-foreground">—</span>
  const good = change === 0 ? null : change > 0 === higherIsGood
  return (
    <bdi className={cn('tabular', good === null ? '' : good ? 'text-income' : 'text-expense')}>
      {change > 0 ? '+' : ''}
      {format.number(change, 1)}%
    </bdi>
  )
}

export function AnalyticsPage() {
  const { transactions, settings } = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const { t } = useI18n()
  const period = usePeriod('last-90-days', settings.weekStartsOn)
  const [categoryId, setCategoryId] = useState('')
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null)

  // Transfers between the user's own accounts never count as income or spending; refunds reduce expenses.
  const flows = useMemo(() => transactions.filter((tx) => tx.type !== 'transfer'), [transactions])
  const scoped = useMemo(() => (categoryId ? flows.filter((tx) => tx.categoryId === categoryId) : flows), [flows, categoryId])
  const inPeriod = useMemo(() => filterByRange(scoped, period.range), [scoped, period.range])
  const inComparison = useMemo(() => filterByRange(scoped, period.comparison), [scoped, period.comparison])
  const currencies = useMemo(() => {
    const list = currenciesIn(inPeriod, settings.displayCurrency)
    return list.length ? list : [settings.displayCurrency]
  }, [inPeriod, settings.displayCurrency])
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : (currencies[0] ?? settings.displayCurrency)

  const totalsAll = useMemo(() => totalsByCurrency(inPeriod, settings.displayCurrency), [inPeriod, settings.displayCurrency])
  const previousAll = useMemo(() => totalsByCurrency(inComparison), [inComparison])
  const totals = totalsAll.find((x) => x.currency === currency) ?? emptyTotals(currency)
  const previous = previousAll.find((x) => x.currency === currency) ?? emptyTotals(currency)

  const granularity = chooseGranularity(period.range)
  const granularityText = t(GRANULARITY_KEYS[granularity])
  const series = useMemo(
    () => timeSeries(inPeriod, currency, period.range, granularity, settings.weekStartsOn),
    [inPeriod, currency, period.range, granularity, settings.weekStartsOn],
  )
  const trendPoints = useMemo(
    () => series.map((b) => ({ label: formatBucketLabel(b.start, granularity, format.locale), minor: b.expenseMinor })),
    [series, granularity, format.locale],
  )
  const monthly = useMemo(
    () => timeSeries(inPeriod, currency, period.range, 'month', settings.weekStartsOn).filter((m) => m.incomeMinor || m.expenseMinor),
    [inPeriod, currency, period.range, settings.weekStartsOn],
  )
  const breakdown = useMemo(() => categoryBreakdown(inPeriod, currency, 'expense'), [inPeriod, currency])
  const previousBreakdown = useMemo(() => new Map(categoryBreakdown(inComparison, currency, 'expense').map((c) => [c.categoryId, c])), [inComparison, currency])
  const enoughForTrend = series.filter((b) => b.expenseMinor > 0).length >= 2

  const comparisonRows: { label: string; current: number; previous: number; higherIsGood: boolean; signed?: boolean }[] = [
    { label: t('dashboard.seriesIncome'), current: totals.incomeMinor, previous: previous.incomeMinor, higherIsGood: true },
    { label: t('dashboard.seriesExpenses'), current: totals.expenseMinor, previous: previous.expenseMinor, higherIsGood: false },
    { label: t('types.refund'), current: totals.refundMinor, previous: previous.refundMinor, higherIsGood: true },
    { label: t('dashboard.seriesNet'), current: totals.netMinor, previous: previous.netMinor, higherIsGood: true, signed: true },
  ]

  return (
    <>
      <PageHeader title={t('analytics.title')} description={t('analytics.subtitle')} />

      <Card className="mb-5 py-4">
        <CardContent className="flex flex-wrap items-end justify-between gap-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            <PeriodPicker value={period} onPresetChange={period.setPreset} onCustomChange={period.setCustomRange} />
            <div className="grid gap-1">
              <Label htmlFor="analytics-category" className="text-xs text-muted-foreground">
                {t('analytics.category')}
              </Label>
              <CategorySelect id="analytics-category" allowAll value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48" />
            </div>
          </div>
          <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosenCurrency} label={t('dashboard.currencyShown')} />
        </CardContent>
      </Card>

      <p className="mb-4 text-sm text-muted-foreground">
        {t('analytics.rangeLine', {
          range: format.range(period.range),
          days: format.number(rangeLengthDays(period.range)),
          comparison: format.range(period.comparison),
        })}
        {categoryId ? ` · ${t('analytics.onlyCategory', { category: lookup.name(categoryId) })}` : ''} · {currency}
      </p>

      {inPeriod.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3Icon} title={t('analytics.emptyTitle')} description={t('analytics.emptyText')} />
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.comparison')}</CardTitle>
              <CardDescription>
                {t('analytics.comparisonText', { currency })} {t('analytics.flowsNote')} {previous.count === 0 ? t('analytics.comparisonNone') : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('analytics.measure')}</TableHead>
                    <TableHead className="text-end">{t('analytics.thisPeriod')}</TableHead>
                    <TableHead className="text-end">{t('analytics.previousPeriod')}</TableHead>
                    <TableHead className="text-end">{t('analytics.change')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-end">
                        <Money minor={row.current} currency={currency} tone={row.signed ? 'signed' : undefined} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Money minor={row.previous} currency={currency} tone={row.signed ? 'signed' : undefined} />
                      </TableCell>
                      <TableCell className="text-end">
                        <ChangeCell current={row.current} previous={row.previous} higherIsGood={row.higherIsGood} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>{t('analytics.count')}</TableCell>
                    <TableCell className="text-end tabular">{format.number(totals.count)}</TableCell>
                    <TableCell className="text-end tabular">{format.number(previous.count)}</TableCell>
                    <TableCell className="text-end">
                      <span className="text-muted-foreground">—</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.incomeVsExpenses')}</CardTitle>
                <CardDescription>
                  {currency} · {granularityText}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {totals.count === 0 ? (
                  <EmptyState icon={BarChart3Icon} title={t('dashboard.noTransactionsInPeriod', { currency })} />
                ) : (
                  <IncomeExpenseChart buckets={series} currency={currency} granularity={granularity} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.trend')}</CardTitle>
                <CardDescription>
                  {t('analytics.trendText', { currency, granularity: granularityText })}
                  {categoryId ? ` · ${lookup.name(categoryId)}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enoughForTrend ? (
                  <TrendChart points={trendPoints} currency={currency} seriesLabel={t('dashboard.seriesExpenses')} />
                ) : (
                  <EmptyState icon={InfoIcon} title={t('analytics.notEnough')} description={t('analytics.notEnoughText')} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.byCategory')}</CardTitle>
                <CardDescription>{t('analytics.byCategoryText', { currency })}</CardDescription>
              </CardHeader>
              <CardContent>
                {breakdown.length === 0 ? (
                  <EmptyState icon={BarChart3Icon} title={t('dashboard.noExpenses')} />
                ) : (
                  <CategoryBars items={breakdown} currency={currency} limit={8} linkParams={{ from: period.range.from, to: period.range.to }} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.topCategories')}</CardTitle>
                <CardDescription>{t('analytics.topCategoriesText')}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {breakdown.length === 0 ? (
                  <EmptyState icon={BarChart3Icon} title={t('dashboard.noExpenses')} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('analytics.category')}</TableHead>
                        <TableHead className="text-end">{t('analytics.thisPeriod')}</TableHead>
                        <TableHead className="text-end">{t('analytics.previous')}</TableHead>
                        <TableHead className="text-end">{t('analytics.change')}</TableHead>
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
                            <TableCell className="text-end">
                              <Money minor={c.totalMinor} currency={currency} />
                            </TableCell>
                            <TableCell className="text-end">
                              <Money minor={prev} currency={currency} />
                            </TableCell>
                            <TableCell className="text-end">
                              <ChangeCell current={c.totalMinor} previous={prev} higherIsGood={false} />
                            </TableCell>
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
              <CardTitle>{t('analytics.monthly')}</CardTitle>
              <CardDescription>{t('analytics.monthlyText', { currency })}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {monthly.length === 0 ? (
                <EmptyState icon={BarChart3Icon} title={t('dashboard.noTransactionsInPeriod', { currency })} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('analytics.month')}</TableHead>
                      <TableHead className="text-end">{t('dashboard.seriesIncome')}</TableHead>
                      <TableHead className="text-end">{t('dashboard.seriesExpenses')}</TableHead>
                      <TableHead className="text-end">{t('dashboard.seriesNet')}</TableHead>
                      <TableHead className="text-end">{t('analytics.saved')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthly.map((m) => (
                      <TableRow key={m.start}>
                        <TableCell>{format.month(m.start.slice(0, 7))}</TableCell>
                        <TableCell className="text-end">
                          <Money minor={m.incomeMinor} currency={currency} />
                        </TableCell>
                        <TableCell className="text-end">
                          <Money minor={m.expenseMinor} currency={currency} />
                        </TableCell>
                        <TableCell className="text-end">
                          <Money minor={m.netMinor} currency={currency} tone="signed" />
                        </TableCell>
                        <TableCell className="text-end tabular text-muted-foreground">
                          {m.incomeMinor > 0 ? `${format.number(Math.round((m.netMinor / m.incomeMinor) * 100))}%` : '—'}
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
              <CardTitle>{t('analytics.byCurrency')}</CardTitle>
              <CardDescription>{t('analytics.byCurrencyText')}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.currency')}</TableHead>
                    <TableHead className="text-end">{t('dashboard.seriesIncome')}</TableHead>
                    <TableHead className="text-end">{t('dashboard.seriesExpenses')}</TableHead>
                    <TableHead className="text-end">{t('dashboard.seriesNet')}</TableHead>
                    <TableHead className="text-end">{t('analytics.count')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totalsAll.map((row) => (
                    <TableRow key={row.currency}>
                      <TableCell className="font-medium">{row.currency}</TableCell>
                      <TableCell className="text-end">
                        <Money minor={row.incomeMinor} currency={row.currency} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Money minor={row.expenseMinor} currency={row.currency} />
                      </TableCell>
                      <TableCell className="text-end">
                        <Money minor={row.netMinor} currency={row.currency} tone="signed" />
                      </TableCell>
                      <TableCell className="text-end tabular">{format.number(row.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {totalsAll.length > 1 ? (
            <ConvertedTotal
              title={t('analytics.netAcross')}
              target={settings.displayCurrency}
              amounts={totalsAll.map((row) => ({ currency: row.currency, amountMinor: row.netMinor }))}
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
