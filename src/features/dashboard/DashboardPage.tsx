import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  InfoIcon,
  PieChartIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptIcon,
  WalletIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart'
import { Money } from '@/components/common/Money'
import { CurrencySwitcher, PeriodPicker } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useFinance } from '@/data/DataProvider'
import { BudgetHealthBadge, budgetIndicatorClass } from '@/features/budgets/budgetUi'
import { BillTimingBadge } from '@/features/recurring/billUi'
import { useTransactionDialogs } from '@/features/transactions/useTransactionDialogs'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { usePeriod } from '@/hooks/use-period'
import { chooseGranularity, monthOf } from '@/lib/dates'
import {
  balancesByCurrency,
  budgetAppliesToMonth,
  budgetUsage,
  categoryBreakdown,
  currenciesIn,
  emptyTotals,
  filterByRange,
  percentChange,
  timeSeries,
  totalsByCurrency,
} from '@/lib/finance'
import { billsDueWithin } from '@/lib/recurring'
import { cn } from '@/lib/utils'

function Delta({ current, previous, invert, available }: { current: number; previous: number; invert?: boolean; available: boolean }) {
  if (!available) return <span className="text-xs text-muted-foreground">No data for the comparison period</span>
  const change = percentChange(current, previous)
  if (change === null) return <span className="text-xs text-muted-foreground">Nothing to compare in the previous period</span>
  const up = change > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', change === 0 ? 'text-muted-foreground' : good ? 'text-income' : 'text-expense')}>
      {change !== 0 ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      {Math.abs(change).toFixed(change !== 0 && Math.abs(change) < 10 ? 1 : 0)}% vs previous period
    </span>
  )
}

function StatCard({ title, icon: Icon, value, footer }: { title: string; icon: typeof WalletIcon; value: ReactNode; footer: ReactNode }) {
  return (
    <Card className="gap-2 py-4 sm:py-5">
      <CardHeader className="px-4 sm:px-5">
        <CardDescription className="flex items-center gap-2 text-xs sm:text-sm">
          <Icon className="size-4" aria-hidden="true" />
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        <p className="text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
        <div className="mt-1 min-h-4">{footer}</div>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const data = useFinance()
  const { transactions, settings, budgets, recurringBills } = data
  const format = useFormat()
  const lookup = useCategoryLookup()
  const period = usePeriod('this-month')
  const dialogs = useTransactionDialogs()

  const inPeriod = useMemo(() => filterByRange(transactions, period.range), [transactions, period.range])
  const inComparison = useMemo(() => filterByRange(transactions, period.comparison), [transactions, period.comparison])
  const periodTotals = useMemo(() => totalsByCurrency(inPeriod, settings.displayCurrency), [inPeriod, settings.displayCurrency])
  const balances = useMemo(
    () => balancesByCurrency(transactions, settings.openingBalances, period.today, settings.displayCurrency),
    [transactions, settings.openingBalances, period.today, settings.displayCurrency],
  )

  const currencies = useMemo(() => {
    const list = currenciesIn(inPeriod, settings.displayCurrency)
    return list.length ? list : [settings.displayCurrency]
  }, [inPeriod, settings.displayCurrency])
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null)
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : (currencies[0] ?? settings.displayCurrency)

  const totals = periodTotals.find((t) => t.currency === currency) ?? emptyTotals(currency)
  const previous = totalsByCurrency(inComparison).find((t) => t.currency === currency) ?? emptyTotals(currency)
  const comparisonAvailable = previous.count > 0
  const balance = balances.find((b) => b.currency === currency)
  const granularity = chooseGranularity(period.range)
  const series = useMemo(
    () => timeSeries(inPeriod, currency, period.range, granularity, settings.weekStartsOn),
    [inPeriod, currency, period.range, granularity, settings.weekStartsOn],
  )
  const breakdown = useMemo(() => categoryBreakdown(inPeriod, currency, 'expense'), [inPeriod, currency])
  const otherCurrencyTotals = periodTotals.filter((t) => t.currency !== currency)

  const month = monthOf(period.today)
  const activeBudgets = budgets
    .filter((b) => budgetAppliesToMonth(b, month))
    .map((b) => ({ budget: b, usage: budgetUsage(b, transactions, month) }))
    .sort((a, b) => b.usage.ratio - a.usage.ratio)
  const dueBills = billsDueWithin(recurringBills, period.today, 14)
  const recent = transactions.slice(0, 6)

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your financial overview." />
        <Card>
          <EmptyState
            icon={WalletIcon}
            title="Welcome to SpendWise"
            description={
              <>
                Record your first income or expense to see totals, trends and budgets here. You can set your preferred currency and
                opening balance in <Link to="/settings" className="font-medium text-primary underline-offset-4 hover:underline">Settings</Link>.
              </>
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => dialogs.openCreate('expense')}>
                  <PlusIcon /> Add expense
                </Button>
                <Button variant="outline" onClick={() => dialogs.openCreate('income')}>
                  <PlusIcon /> Add income
                </Button>
              </div>
            }
          />
        </Card>
        {dialogs.dialogs}
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            {format.range(period.range)} · compared with {format.range(period.comparison)}
          </>
        }
        actions={
          <Button onClick={() => dialogs.openCreate()}>
            <PlusIcon /> Add transaction
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker value={period} onPresetChange={period.setPreset} onCustomChange={period.setCustomRange} />
        <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosenCurrency} label="Currency shown" />
      </div>

      <section aria-label={`Summary in ${currency}`} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          title={`Income · ${currency}`}
          icon={ArrowUpRightIcon}
          value={<Money minor={totals.incomeMinor} currency={currency} />}
          footer={<Delta current={totals.incomeMinor} previous={previous.incomeMinor} available={comparisonAvailable} />}
        />
        <StatCard
          title={`Expenses · ${currency}`}
          icon={ArrowDownRightIcon}
          value={<Money minor={totals.expenseMinor} currency={currency} />}
          footer={<Delta current={totals.expenseMinor} previous={previous.expenseMinor} invert available={comparisonAvailable} />}
        />
        <StatCard
          title={`Net cash flow · ${currency}`}
          icon={ReceiptIcon}
          value={<Money minor={totals.netMinor} currency={currency} tone="signed" />}
          footer={<span className="text-xs text-muted-foreground">Income minus expenses in this period</span>}
        />
        <StatCard
          title={`Current balance · ${currency}`}
          icon={WalletIcon}
          value={balance ? <Money minor={balance.balanceMinor} currency={currency} /> : <span className="text-muted-foreground">—</span>}
          footer={
            <span className="text-xs text-muted-foreground">
              {balance?.hasOpeningBalance
                ? `Opening balance + all ${currency} transactions to today`
                : 'No opening balance set — '}
              {!balance?.hasOpeningBalance ? (
                <Link to="/settings#balances" className="font-medium text-primary hover:underline">add one</Link>
              ) : null}
            </span>
          }
        />
      </section>

      {otherCurrencyTotals.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            <span className="text-muted-foreground">This period also has activity in other currencies (not converted or added to the figures above): </span>
            {otherCurrencyTotals.map((t, i) => (
              <span key={t.currency}>
                {i > 0 ? '; ' : ''}
                <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setChosenCurrency(t.currency)}>
                  {t.currency}
                </button>{' '}
                income <Money minor={t.incomeMinor} currency={t.currency} />, expenses <Money minor={t.expenseMinor} currency={t.currency} />
              </span>
            ))}
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Income vs expenses</CardTitle>
            <CardDescription>
              {currency}, by {granularity}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totals.count === 0 ? (
              <EmptyState icon={ReceiptIcon} title={`No ${currency} transactions in this period`} description="Pick another period or add a transaction." />
            ) : (
              <IncomeExpenseChart buckets={series} currency={currency} granularity={granularity} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>{currency} expenses in this period</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <EmptyState icon={PieChartIcon} title="No expenses in this period" />
            ) : (
              <CategoryBars items={breakdown} currency={currency} limit={5} linkParams={{ from: period.range.from, to: period.range.to }} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Budgets</CardTitle>
            <CardDescription>{format.month(month)}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/budgets">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {activeBudgets.length === 0 ? (
              <EmptyState
                icon={PiggyBankIcon}
                title="No budgets this month"
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/budgets">Create a budget</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-4">
                {activeBudgets.slice(0, 4).map(({ budget, usage }) => (
                  <li key={budget.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{budget.name}</span>
                      <BudgetHealthBadge health={usage.health} />
                    </div>
                    <Progress
                      value={usage.ratio * 100}
                      className="mt-2"
                      indicatorClassName={budgetIndicatorClass(usage.health)}
                      aria-label={`${budget.name}: ${Math.round(usage.ratio * 100)}% used`}
                    />
                    <p className="mt-1 text-xs text-muted-foreground tabular">
                      {format.money(usage.spentMinor, budget.currency)} of {format.money(budget.limitMinor, budget.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming bills</CardTitle>
            <CardDescription>Overdue and due in the next 14 days</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/bills">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {dueBills.length === 0 ? (
              <EmptyState icon={CalendarClockIcon} title="Nothing due soon" />
            ) : (
              <ul className="divide-y">
                {dueBills.slice(0, 5).map((bill) => (
                  <li key={bill.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{bill.name}</p>
                      <p className="text-xs text-muted-foreground">{format.date(bill.nextDueDate)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Money minor={bill.amountMinor} currency={bill.currency} className="text-sm" />
                      <BillTimingBadge bill={bill} today={period.today} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/transactions">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => dialogs.openDetails(t)}
                    className="flex w-full items-center gap-3 py-2.5 text-left outline-none first:pt-0 focus-visible:bg-muted/60"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: lookup.color(t.categoryId) }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        {format.date(t.date)} · {lookup.name(t.categoryId)}
                      </span>
                    </span>
                    <Money minor={t.amountMinor} currency={t.currency} type={t.type} className="text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {balances.length > 1 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Balances by currency:{' '}
          {balances.map((b, i) => (
            <span key={b.currency}>
              {i > 0 ? ' · ' : ''}
              <Badge variant="outline" className="mr-1">{b.currency}</Badge>
              <Money minor={b.balanceMinor} currency={b.currency} />
            </span>
          ))}
        </p>
      ) : null}
      {dialogs.dialogs}
    </>
  )
}
