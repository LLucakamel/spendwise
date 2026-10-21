import { FileTextIcon, PrinterIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppPath } from '@/app/session'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { Money } from '@/components/common/Money'
import { CurrencySwitcher } from '@/components/common/pickers'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import type { IsoMonth } from '@/domain/types'
import { HealthBadge } from '@/features/analytics/AnalyticsExtras'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { isValidIsoMonth, monthOf, monthRange, todayIso } from '@/lib/dates'
import { budgetAppliesToMonth, budgetUsage, categoryBreakdown, currenciesIn, filterByRange, totalsByCurrency } from '@/lib/finance'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

export function ReportTab() {
  const { transactions, budgets, settings } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const appPath = useAppPath()
  const [month, setMonth] = useState<IsoMonth>(() => monthOf(todayIso()))
  const [chosen, setChosen] = useState<string | null>(null)

  const range = useMemo(() => monthRange(month), [month])
  // Transfers between own accounts are not income or spending, so they are left out of the report.
  const inMonth = useMemo(() => filterByRange(transactions, range).filter((tx) => tx.type !== 'transfer'), [transactions, range])
  const totals = useMemo(() => totalsByCurrency(inMonth, settings.displayCurrency), [inMonth, settings.displayCurrency])
  const currencies = useMemo(() => {
    const list = currenciesIn(inMonth, settings.displayCurrency)
    return list.length ? list : [settings.displayCurrency]
  }, [inMonth, settings.displayCurrency])
  const currency = chosen && currencies.includes(chosen) ? chosen : (currencies[0] ?? settings.displayCurrency)
  const breakdown = useMemo(() => categoryBreakdown(inMonth, currency, 'expense'), [inMonth, currency])
  const largest = useMemo(
    () => inMonth.filter((tx) => tx.type === 'expense' && tx.currency === currency).sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 5),
    [inMonth, currency],
  )
  const budgetRows = useMemo(
    () => budgets.filter((b) => budgetAppliesToMonth(b, month)).map((b) => ({ budget: b, usage: budgetUsage(b, transactions, month) })),
    [budgets, transactions, month],
  )
  const billsPaid = useMemo(() => inMonth.filter((tx) => tx.recurringBillId !== null).sort((a, b) => a.date.localeCompare(b.date)), [inMonth])
  const txLink = (id: string) => `${appPath('/transactions')}?open=${encodeURIComponent(id)}`

  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader>
        <CardTitle>
          {t('tools.report.title')} · {format.month(month)}
        </CardTitle>
        <CardDescription>{t('analytics.byCurrencyText')}</CardDescription>
        <CardAction className="print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon /> {t('tools.report.print')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="grid gap-1">
            <Label htmlFor="report-month" className="text-xs text-muted-foreground">
              {t('tools.report.month')}
            </Label>
            <Input id="report-month" type="month" className="w-44" value={month} onChange={(e) => isValidIsoMonth(e.target.value) && setMonth(e.target.value)} />
          </div>
          <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosen} />
        </div>

        {inMonth.length === 0 ? (
          <EmptyState icon={FileTextIcon} title={t('tools.report.none', { month: format.month(month) })} />
        ) : (
          <>
            <Section title={t('tools.report.summary')}>
              <div className="overflow-x-auto">
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
                    {totals.map((row) => (
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
              </div>
            </Section>

            <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
              <Section title={`${t('tools.report.topCategories')} · ${currency}`}>
                {breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('dashboard.noExpenses')}</p>
                ) : (
                  <CategoryBars items={breakdown} currency={currency} limit={6} linkParams={{ from: range.from, to: range.to }} />
                )}
              </Section>
              <Section title={`${t('tools.report.topMerchants')} · ${currency}`}>
                {largest.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('dashboard.noExpenses')}</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {largest.map((tx) => (
                      <li key={tx.id}>
                        <Link to={txLink(tx.id)} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60">
                          <span className="min-w-0">
                            <span className="block truncate">{tx.description}</span>
                            <span className="block text-xs text-muted-foreground">{format.date(tx.date)}</span>
                          </span>
                          <Money minor={tx.amountMinor} currency={tx.currency} className="shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Section title={t('tools.report.budgets')}>
              {budgetRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('budgets.noneThisMonth', { month: format.month(month) })}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('analytics.budget')}</TableHead>
                        <TableHead className="text-end">{t('dashboard.seriesExpenses')}</TableHead>
                        <TableHead className="text-end">{t('budgets.form.limit')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetRows.map(({ budget, usage }) => (
                        <TableRow key={budget.id}>
                          <TableCell className="font-medium">{budget.name}</TableCell>
                          <TableCell className="text-end tabular">
                            <Money minor={usage.spentMinor} currency={budget.currency} /> ({format.number(Math.round(usage.ratio * 100))}%)
                          </TableCell>
                          <TableCell className="text-end">
                            <Money minor={budget.limitMinor} currency={budget.currency} />
                          </TableCell>
                          <TableCell>
                            <HealthBadge health={usage.health} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Section>

            <Section title={t('tools.report.bills')}>
              {billsPaid.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('bills.noPayments')}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {billsPaid.map((tx) => (
                    <li key={tx.id}>
                      <Link to={txLink(tx.id)} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60">
                        <span className="min-w-0">
                          <span className="block truncate">{tx.description}</span>
                          <span className="block text-xs text-muted-foreground">{format.date(tx.date)}</span>
                        </span>
                        <Money minor={tx.amountMinor} currency={tx.currency} className="shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
