import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  CreditCardIcon,
  InfoIcon,
  LightbulbIcon,
  OctagonAlertIcon,
  PieChartIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptIcon,
  TrendingUpIcon,
  WalletIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppPath } from '@/app/session'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart'
import { ConvertedTotal } from '@/components/common/ConvertedTotal'
import { Money } from '@/components/common/Money'
import { CurrencySwitcher, PeriodPicker } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useFinance } from '@/data/DataProvider'
import type { RecurringBill } from '@/domain/types'
import { useTransactionDialogs } from '@/features/transactions/useTransactionDialogs'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { usePeriod } from '@/hooks/use-period'
import { useI18n, type MessageKey } from '@/i18n'
import { chooseGranularity, fromIsoDate, monthOf, toIsoDate, type Granularity } from '@/lib/dates'
import {
  accountBalances,
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
  type BudgetHealth,
} from '@/lib/finance'
import { expectedPayments, expectedTotalsByCurrency } from '@/lib/income'
import { computeInsights } from '@/lib/insights'
import { addMinor } from '@/lib/money'
import { billsDueWithin, billTiming, daysUntil } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import { addDays } from 'date-fns'
import { GettingStarted } from './GettingStarted'

const GRANULARITY_KEYS: Record<Granularity, MessageKey> = { day: 'periods.byDay', week: 'periods.byWeek', month: 'periods.byMonth' }
const EXPECTED_HORIZON_DAYS = 30

function Delta({ current, previous, invert, available }: { current: number; previous: number; invert?: boolean; available: boolean }) {
  const { t } = useI18n()
  const format = useFormat()
  if (!available) return <span className="text-xs text-muted-foreground">{t('dashboard.noComparisonData')}</span>
  const change = percentChange(current, previous)
  if (change === null) return <span className="text-xs text-muted-foreground">{t('dashboard.nothingToCompare')}</span>
  const up = change > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', change === 0 ? 'text-muted-foreground' : good ? 'text-income' : 'text-expense')}>
      {change !== 0 ? <Icon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" /> : null}
      {t('dashboard.vsPrevious', { value: format.number(Math.abs(change), change !== 0 && Math.abs(change) < 10 ? 1 : 0) })}
    </span>
  )
}

function StatCard({ title, icon: Icon, value, footer, iconClassName }: { title: string; icon: typeof WalletIcon; value: ReactNode; footer: ReactNode; iconClassName?: string }) {
  return (
    <Card className="gap-2 py-4 sm:py-5">
      <CardHeader className="px-4 sm:px-5">
        <CardDescription className="flex items-center gap-2 text-xs sm:text-sm">
          <Icon className={cn('size-4', iconClassName)} aria-hidden="true" />
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

const HEALTH: Record<BudgetHealth, { icon: typeof WalletIcon; key: MessageKey; cls: string; bar: string }> = {
  ok: { icon: CheckCircle2Icon, key: 'budgets.health.ok', cls: 'text-income', bar: 'bg-primary' },
  warning: { icon: AlertTriangleIcon, key: 'budgets.health.warning', cls: 'text-warning', bar: 'bg-warning' },
  over: { icon: OctagonAlertIcon, key: 'budgets.health.over', cls: 'text-expense', bar: 'bg-expense' },
}

/** Budget status shown with an icon and text, never colour alone. */
function HealthLabel({ health }: { health: BudgetHealth }) {
  const { t } = useI18n()
  const config = HEALTH[health]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium', config.cls)}>
      <config.icon className="size-3.5" aria-hidden="true" />
      {t(config.key)}
    </span>
  )
}

function BillDueBadge({ bill, today }: { bill: Pick<RecurringBill, 'status' | 'nextDueDate'>; today: string }) {
  const { t } = useI18n()
  const timing = billTiming(bill, today)
  const days = daysUntil(bill.nextDueDate, today)
  const config = {
    overdue: { icon: AlertCircleIcon, label: t('bills.timing.overdue', { count: -days }), cls: 'bg-expense-soft text-expense' },
    'due-today': { icon: ClockIcon, label: t('bills.timing.today'), cls: 'bg-warning-soft text-foreground' },
    'due-soon': { icon: ClockIcon, label: t('bills.timing.soon', { count: days }), cls: 'bg-warning-soft text-foreground' },
    scheduled: { icon: CalendarCheckIcon, label: t('bills.timing.scheduled', { count: days }), cls: 'bg-muted text-muted-foreground' },
    paused: { icon: ClockIcon, label: t('bills.timing.paused'), cls: 'bg-muted text-muted-foreground' },
    ended: { icon: ClockIcon, label: t('bills.timing.ended'), cls: 'bg-muted text-muted-foreground' },
  }[timing]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', config.cls)}>
      <config.icon className="size-3" aria-hidden="true" />
      {config.label}
    </span>
  )
}

export function DashboardPage() {
  const data = useFinance()
  const { transactions, settings, budgets, recurringBills, accounts, incomeSources } = data
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const period = usePeriod('this-month', settings.weekStartsOn)
  const dialogs = useTransactionDialogs()
  const appPath = useAppPath()

  const inPeriod = useMemo(() => filterByRange(transactions, period.range), [transactions, period.range])
  const inComparison = useMemo(() => filterByRange(transactions, period.comparison), [transactions, period.comparison])
  const periodTotals = useMemo(() => totalsByCurrency(inPeriod, settings.displayCurrency), [inPeriod, settings.displayCurrency])
  const balances = useMemo(
    () => balancesByCurrency(transactions, settings.openingBalances, period.today, settings.displayCurrency, accounts),
    [transactions, settings.openingBalances, period.today, settings.displayCurrency, accounts],
  )

  const currencies = useMemo(() => {
    const list = currenciesIn(inPeriod, settings.displayCurrency)
    return list.length ? list : [settings.displayCurrency]
  }, [inPeriod, settings.displayCurrency])
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null)
  const currency = chosenCurrency && currencies.includes(chosenCurrency) ? chosenCurrency : (currencies[0] ?? settings.displayCurrency)

  const totals = periodTotals.find((x) => x.currency === currency) ?? emptyTotals(currency)
  const previous = totalsByCurrency(inComparison).find((x) => x.currency === currency) ?? emptyTotals(currency)
  const comparisonAvailable = previous.count > 0
  const balance = balances.find((b) => b.currency === currency)
  const granularity = chooseGranularity(period.range)
  const series = useMemo(
    () => timeSeries(inPeriod, currency, period.range, granularity, settings.weekStartsOn),
    [inPeriod, currency, period.range, granularity, settings.weekStartsOn],
  )
  const breakdown = useMemo(() => categoryBreakdown(inPeriod, currency, 'expense'), [inPeriod, currency])
  const otherCurrencyTotals = periodTotals.filter((x) => x.currency !== currency)

  const month = monthOf(period.today)
  const activeBudgets = budgets
    .filter((b) => budgetAppliesToMonth(b, month))
    .map((b) => ({ budget: b, usage: budgetUsage(b, transactions, month) }))
    .sort((a, b) => b.usage.ratio - a.usage.ratio)
  const dueBills = billsDueWithin(recurringBills, period.today, 14)
  const recent = transactions.slice(0, 6)

  const expected = useMemo(() => {
    const horizon = { from: period.today, to: toIsoDate(addDays(fromIsoDate(period.today), EXPECTED_HORIZON_DAYS)) }
    return expectedPayments(incomeSources, transactions, horizon, period.today, true)
  }, [incomeSources, transactions, period.today])
  const expectedTotals = [...expectedTotalsByCurrency(expected).entries()]

  // Card debt per currency, from the recorded balances of active credit cards.
  const cards = useMemo(() => accounts.filter((a) => a.kind === 'credit-card' && !a.archived), [accounts])
  const cardDebt = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of accountBalances(cards, transactions, period.today)) {
      map.set(b.currency, addMinor(map.get(b.currency) ?? 0, b.owedMinor ?? 0))
    }
    return [...map.entries()]
  }, [cards, transactions, period.today])

  const insights = computeInsights({
    currency,
    periodTransactions: inPeriod,
    comparisonTransactions: inComparison,
    allTransactions: transactions,
    budgets,
    bills: recurringBills,
    incomeSources,
    month,
    today: period.today,
    categoryName: lookup.name,
    money: format.money,
  })

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader title={t('dashboard.title')} description={t('dashboard.overview')} />
        <GettingStarted onAddTransaction={(type) => dialogs.openCreate({ type })} />
        {dialogs.dialogs}
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={t('periods.comparedWith', { range: format.range(period.range), comparison: format.range(period.comparison) })}
        actions={
          <Button onClick={() => dialogs.openCreate()}>
            <PlusIcon /> {t('dashboard.addTransaction')}
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker value={period} onPresetChange={period.setPreset} onCustomChange={period.setCustomRange} />
        <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosenCurrency} label={t('dashboard.currencyShown')} />
      </div>

      <section aria-label={currency} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          title={t('dashboard.income', { currency })}
          icon={ArrowUpRightIcon}
          iconClassName="rtl:-scale-x-100"
          value={<Money minor={totals.incomeMinor} currency={currency} />}
          footer={<Delta current={totals.incomeMinor} previous={previous.incomeMinor} available={comparisonAvailable} />}
        />
        <StatCard
          title={t('dashboard.expenses', { currency })}
          icon={ArrowDownRightIcon}
          iconClassName="rtl:-scale-x-100"
          value={<Money minor={totals.expenseMinor} currency={currency} />}
          footer={<Delta current={totals.expenseMinor} previous={previous.expenseMinor} invert available={comparisonAvailable} />}
        />
        <StatCard
          title={t('dashboard.net', { currency })}
          icon={ReceiptIcon}
          value={<Money minor={totals.netMinor} currency={currency} tone="signed" />}
          footer={<span className="text-xs text-muted-foreground">{t('dashboard.netHint')}</span>}
        />
        <StatCard
          title={t('dashboard.balance', { currency })}
          icon={WalletIcon}
          value={balance ? <Money minor={balance.balanceMinor} currency={currency} /> : <span className="text-muted-foreground">—</span>}
          footer={
            <span className="text-xs text-muted-foreground">
              {balance?.hasOpeningBalance ? t('dashboard.balanceHint', { currency }) : t('dashboard.noOpening')}
              {!balance?.hasOpeningBalance ? (
                <Link to={`${appPath('/settings')}?section=balances`} className="font-medium text-primary hover:underline">
                  {t('dashboard.addOne')}
                </Link>
              ) : null}
            </span>
          }
        />
      </section>

      {otherCurrencyTotals.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            <span className="text-muted-foreground">{t('dashboard.otherCurrencies')} </span>
            {otherCurrencyTotals.map((x, i) => (
              <span key={x.currency}>
                {i > 0 ? '; ' : ''}
                <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => setChosenCurrency(x.currency)}>
                  {t('dashboard.otherCurrencyLine', {
                    currency: x.currency,
                    income: format.money(x.incomeMinor, x.currency),
                    expenses: format.money(x.expenseMinor, x.currency),
                  })}
                </button>
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {insights.length > 0 || periodTotals.length > 1 ? (
        <div className={cn('mt-4 grid gap-4', periodTotals.length > 1 && insights.length > 0 && 'lg:grid-cols-2')}>
          {insights.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LightbulbIcon className="size-4 text-warning" aria-hidden="true" /> {t('dashboard.insights')}
                </CardTitle>
                <CardDescription>{t('dashboard.insightsText')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {insights.map((insight) => (
                    <li key={insight.id} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          insight.tone === 'warning' ? 'bg-warning' : insight.tone === 'positive' ? 'bg-income' : 'bg-muted-foreground',
                        )}
                      />
                      <span>
                        {insight.tone !== 'neutral' ? (
                          <span className="sr-only">{insight.tone === 'warning' ? t('dashboard.warning') : t('dashboard.good')} </span>
                        ) : null}
                        {t(insight.key, insight.vars)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {periodTotals.length > 1 ? (
            <ConvertedTotal
              title={t('dashboard.combinedExpenses')}
              target={settings.displayCurrency}
              amounts={periodTotals.filter((x) => x.expenseMinor > 0).map((x) => ({ currency: x.currency, amountMinor: x.expenseMinor }))}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.incomeVsExpenses')}</CardTitle>
            <CardDescription>{t('dashboard.chartText', { currency, granularity: t(GRANULARITY_KEYS[granularity]) })}</CardDescription>
          </CardHeader>
          <CardContent>
            {totals.count === 0 ? (
              <EmptyState icon={ReceiptIcon} title={t('dashboard.noTransactionsInPeriod', { currency })} description={t('dashboard.pickAnother')} />
            ) : (
              <IncomeExpenseChart buckets={series} currency={currency} granularity={granularity} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.spendingByCategory')}</CardTitle>
            <CardDescription>{t('dashboard.spendingByCategoryText', { currency })}</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <EmptyState icon={PieChartIcon} title={t('dashboard.noExpenses')} />
            ) : (
              <CategoryBars items={breakdown} currency={currency} limit={5} linkParams={{ from: period.range.from, to: period.range.to }} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.budgets')}</CardTitle>
            <CardDescription>{format.month(month)}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to={appPath('/budgets')}>{t('common.viewAll')}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {activeBudgets.length === 0 ? (
              <EmptyState
                icon={PiggyBankIcon}
                title={t('dashboard.noBudgets')}
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to={appPath('/budgets')}>{t('dashboard.createBudget')}</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-4">
                {activeBudgets.slice(0, 4).map(({ budget, usage }) => (
                  <li key={budget.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{budget.name}</span>
                      <HealthLabel health={usage.health} />
                    </div>
                    <Progress
                      value={Math.min(100, usage.ratio * 100)}
                      className="mt-2"
                      indicatorClassName={HEALTH[usage.health].bar}
                      aria-label={t('dashboard.budgetAria', { name: budget.name, percent: format.number(Math.round(usage.ratio * 100)) })}
                    />
                    <p className="mt-1 text-xs text-muted-foreground tabular">
                      {t('dashboard.budgetUsed', { spent: format.money(usage.spentMinor, budget.currency), limit: format.money(budget.limitMinor, budget.currency) })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.upcomingBills')}</CardTitle>
            <CardDescription>{t('dashboard.upcomingBillsText')}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to={appPath('/bills')}>{t('common.viewAll')}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {dueBills.length === 0 ? (
              <EmptyState icon={CalendarClockIcon} title={t('dashboard.nothingDue')} />
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
                      <BillDueBadge bill={bill} today={period.today} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.expectedIncome')}</CardTitle>
            <CardDescription>{t('dashboard.expectedIncomeText')}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to={appPath('/income')}>{t('common.viewAll')}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {expected.length === 0 ? (
              <EmptyState icon={TrendingUpIcon} title={t('dashboard.noExpected')} />
            ) : (
              <>
                <ul className="divide-y">
                  {expected.slice(0, 5).map(({ source, occurrence }) => (
                    <li key={`${source.id}-${occurrence.dueDate}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <Link to={`${appPath('/income')}?source=${source.id}`} className="block truncate text-sm font-medium hover:underline">
                          {source.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{format.date(occurrence.dueDate)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Money minor={occurrence.remainingMinor} currency={occurrence.currency} className="text-sm" />
                        {occurrence.overdue ? (
                          <Badge variant="outline" className="gap-1 border-expense/40 text-expense">
                            <AlertCircleIcon /> {t('income.stateOverdue')}
                          </Badge>
                        ) : occurrence.state === 'partial' ? (
                          <Badge variant="outline">{t('income.statePartial')}</Badge>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t('dashboard.expectedTotal')}{' '}
                  {expectedTotals.map(([code, minor], i) => (
                    <span key={code}>
                      {i > 0 ? ' · ' : ''}
                      <Money minor={minor} currency={code} className="font-medium text-foreground" />
                    </span>
                  ))}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className={cn(cards.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <CardHeader>
            <CardTitle>{t('dashboard.recent')}</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to={appPath('/transactions')}>{t('common.viewAll')}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {recent.map((tx) => (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => dialogs.openDetails(tx)}
                    className="flex w-full items-center gap-3 py-2.5 text-start outline-none first:pt-0 focus-visible:bg-muted/60"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: lookup.color(tx.categoryId) }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tx.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        {format.date(tx.date)} · {lookup.name(tx.categoryId)}
                      </span>
                    </span>
                    <Money minor={tx.amountMinor} currency={tx.currency} type={tx.type} className="text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {cards.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCardIcon className="size-4" aria-hidden="true" /> {t('dashboard.cardDebt')}
              </CardTitle>
              <CardDescription>{t('dashboard.cardDebtText')}</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={appPath('/accounts')}>{t('common.viewAll')}</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {cardDebt.every(([, minor]) => minor === 0) ? (
                <p className="text-sm text-muted-foreground">{t('dashboard.noCardDebt')}</p>
              ) : (
                <ul className="grid gap-2" data-testid="card-debt">
                  {cardDebt
                    .filter(([, minor]) => minor > 0)
                    .map(([code, minor]) => (
                      <li key={code} className="flex items-center justify-between gap-2">
                        <Badge variant="outline">{code}</Badge>
                        <Money minor={minor} currency={code} className="text-lg font-semibold text-expense" />
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {balances.length > 1 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t('dashboard.balancesByCurrency')}{' '}
          {balances.map((b, i) => (
            <span key={b.currency}>
              {i > 0 ? ' · ' : ''}
              <Badge variant="outline" className="me-1">
                {b.currency}
              </Badge>
              <Money minor={b.balanceMinor} currency={b.currency} />
            </span>
          ))}
        </p>
      ) : null}
      {dialogs.dialogs}
    </>
  )
}
