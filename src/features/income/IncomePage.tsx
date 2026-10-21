import { AlertCircleIcon, CheckIcon, DownloadIcon, MoreHorizontalIcon, PlusIcon, TrendingUpIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { CurrencySwitcher, PeriodPicker } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import type { IncomeSource } from '@/domain/types'
import { useTransactionDialogs } from '@/features/transactions/useTransactionDialogs'
import { useAccountLookup, useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { usePeriod } from '@/hooks/use-period'
import { useI18n } from '@/i18n'
import { downloadTextFile, recordsToCsv } from '@/lib/csv'
import { addMonthsToMonth, fromIsoDate, monthOf, monthRange, toIsoDate, todayIso } from '@/lib/dates'
import { categoryBreakdown, filterByRange, timeSeries } from '@/lib/finance'
import { expectedPayments, expectedTotalsByCurrency, incomeBySource, nextIncomeDate, occurrenceStatus } from '@/lib/income'
import { addMinor, minorToDecimalString } from '@/lib/money'
import { cn } from '@/lib/utils'
import { addDays } from 'date-fns'
import { IncomeSourceFormDialog } from './IncomeSourceFormDialog'
import { ReceiveIncomeDialog } from './ReceiveIncomeDialog'

function StateBadge({ state, overdue }: { state: 'expected' | 'partial' | 'received'; overdue: boolean }) {
  const { t } = useI18n()
  if (overdue)
    return (
      <Badge variant="outline" className="gap-1 border-expense/40 text-expense">
        <AlertCircleIcon /> {t('income.stateOverdue')}
      </Badge>
    )
  const label = state === 'received' ? t('income.stateReceived') : state === 'partial' ? t('income.statePartial') : t('income.stateExpected')
  return <Badge variant={state === 'received' ? 'secondary' : 'outline'}>{label}</Badge>
}

export function IncomePage() {
  const data = useFinance()
  const { transactions, incomeSources, settings } = data
  const repo = useRepository()
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const accounts = useAccountLookup()
  const period = usePeriod('this-month', settings.weekStartsOn)
  const today = todayIso()
  const txDialogs = useTransactionDialogs()
  const [params, setParams] = useSearchParams()
  const [form, setForm] = useState<{ open: boolean; source?: IncomeSource }>({ open: false })
  const [receiving, setReceiving] = useState<IncomeSource | null>(null)
  const [skipping, setSkipping] = useState<IncomeSource | null>(null)
  const [toDelete, setToDelete] = useState<IncomeSource | null>(null)
  const highlight = params.get('source')

  useEffect(() => {
    if (!highlight) return
    document.getElementById(`source-${highlight}`)?.scrollIntoView({ block: 'center' })
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params)
      next.delete('source')
      setParams(next, { replace: true })
    }, 2500)
    return () => clearTimeout(timer)
  }, [highlight, params, setParams])

  const setStatus = useMutation((source: IncomeSource, status: IncomeSource['status']) => repo.update('incomeSources', source.id, { status }), { success: 'toast.saved' })
  const skip = useMutation((source: IncomeSource) => repo.skipIncomeOccurrence(source), { success: 'toast.saved', queuesOffline: false })
  const remove = useMutation((id: string) => repo.remove('incomeSources', id), { success: 'toast.deleted', errorPrefix: 'toast.couldNotDelete' })

  const received = useMemo(() => filterByRange(transactions, period.range).filter((tx) => tx.type === 'income'), [transactions, period.range])
  const currencies = useMemo(() => {
    const set = new Set<string>([...received.map((tx) => tx.currency), ...incomeSources.filter((s) => s.status === 'active').map((s) => s.currency)])
    const list = [...set].sort((a, b) => (a === settings.displayCurrency ? -1 : b === settings.displayCurrency ? 1 : a.localeCompare(b)))
    return list.length ? list : [settings.displayCurrency]
  }, [received, incomeSources, settings.displayCurrency])
  const [chosen, setChosen] = useState<string | null>(null)
  const currency = chosen && currencies.includes(chosen) ? chosen : (currencies[0] ?? settings.displayCurrency)

  const receivedTotal = received.filter((tx) => tx.currency === currency).reduce((s, tx) => addMinor(s, tx.amountMinor), 0)
  const expectedInPeriod = expectedPayments(incomeSources, transactions, period.range, today)
  const expectedTotal = expectedTotalsByCurrency(expectedInPeriod).get(currency) ?? 0
  const horizon = { from: today, to: toIsoDate(addDays(fromIsoDate(today), 60)) }
  const upcoming = expectedPayments(incomeSources, transactions, horizon, today, true)
  const overdue = upcoming.filter((u) => u.occurrence.overdue)
  const bySource = incomeBySource(received, currency)
  const byCategory = categoryBreakdown(received, currency, 'income')
  const yearRange = { from: monthRange(addMonthsToMonth(monthOf(today), -11)).from, to: monthRange(monthOf(today)).to }
  const monthly = timeSeries(transactions, currency, yearRange, 'month', settings.weekStartsOn)
  const sourceName = (id: string | null) => (id ? (incomeSources.find((s) => s.id === id)?.name ?? '—') : t('income.noSource'))
  const sources = [...incomeSources].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.nextExpectedDate.localeCompare(b.nextExpectedDate))

  const exportCsv = () => {
    if (received.length === 0) {
      toast.info(t('toast.nothingToExport'))
      return
    }
    const rows = received.map((tx) => [tx.date, tx.description, sourceName(tx.incomeSourceId), lookup.name(tx.categoryId), minorToDecimalString(tx.amountMinor, tx.currency), tx.currency, accounts.name(tx.accountId), tx.incomeDueDate ?? '', tx.sourceRef ?? '', tx.id])
    downloadTextFile(`spendwise-income-${today}.csv`, recordsToCsv(['Date', 'Description', 'Source', 'Category', 'Amount', 'Currency', 'Account', 'Expected date', 'Reference', 'ID'], rows), 'text/csv', true)
    toast.success(t('toast.exported', { count: received.length }))
  }

  return (
    <>
      <PageHeader
        title={t('income.title')}
        description={t('income.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => txDialogs.openCreate({ type: 'income' })}>
              <PlusIcon /> {t('income.recordIncome')}
            </Button>
            <Button onClick={() => setForm({ open: true })}>
              <PlusIcon /> {t('income.newSource')}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker value={period} onPresetChange={period.setPreset} onCustomChange={period.setCustomRange} />
        <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosen} />
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3" aria-label={t('income.title')}>
        <Card className="gap-1 py-4 sm:py-5">
          <CardContent className="px-4 sm:px-5">
            <p className="text-xs text-muted-foreground sm:text-sm">{t('income.received', { currency })}</p>
            <p className="text-xl font-semibold tracking-tight sm:text-2xl" data-testid="income-received">
              <Money minor={receivedTotal} currency={currency} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('income.receivedHint')}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4 sm:py-5">
          <CardContent className="px-4 sm:px-5">
            <p className="text-xs text-muted-foreground sm:text-sm">{t('income.expected', { currency })}</p>
            <p className="text-xl font-semibold tracking-tight text-muted-foreground sm:text-2xl" data-testid="income-expected">
              <Money minor={expectedTotal} currency={currency} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('income.expectedHint')}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 gap-1 py-4 sm:py-5 xl:col-span-1">
          <CardContent className="px-4 sm:px-5">
            <p className="text-xs text-muted-foreground sm:text-sm">{t('income.overdue')}</p>
            <p className={cn('text-xl font-semibold tracking-tight sm:text-2xl', overdue.length && 'text-expense')}>{format.number(overdue.length)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('income.overdueHint')}</p>
          </CardContent>
        </Card>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t('income.sources')}</CardTitle>
            <CardDescription>{t('income.sourcesText')}</CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <EmptyState
                icon={TrendingUpIcon}
                title={t('income.noSources')}
                description={t('income.noSourcesText')}
                action={
                  <Button onClick={() => setForm({ open: true })}>
                    <PlusIcon /> {t('income.newSource')}
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-3">
                {sources.map((source) => {
                  const occ = occurrenceStatus(source, source.nextExpectedDate, transactions, today)
                  const active = source.status === 'active'
                  return (
                    <li
                      key={source.id}
                      id={`source-${source.id}`}
                      className={cn('rounded-lg border p-3 transition-shadow', highlight === source.id && 'ring-[3px] ring-ring/50')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{source.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(`frequencies.${source.frequency}`)} · {lookup.name(source.categoryId)}
                            {source.accountId ? ` · ${accounts.name(source.accountId)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {active ? (
                            <StateBadge state={occ.state} overdue={occ.overdue} />
                          ) : (
                            <Badge variant="secondary">
                              {t(source.status === 'paused' ? 'income.statusPaused' : source.status === 'completed' ? 'income.statusCompleted' : 'income.statusCancelled')}
                            </Badge>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={t('common.actionsFor', { name: source.name })}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setForm({ open: true, source })}>{t('common.edit')}</DropdownMenuItem>
                              {active ? <DropdownMenuItem onSelect={() => setSkipping(source)}>{t('income.skip')}</DropdownMenuItem> : null}
                              {active ? <DropdownMenuItem onSelect={() => void setStatus.run(source, 'paused')}>{t('income.pause')}</DropdownMenuItem> : null}
                              {source.status === 'paused' ? <DropdownMenuItem onSelect={() => void setStatus.run(source, 'active')}>{t('income.resume')}</DropdownMenuItem> : null}
                              {source.status === 'active' || source.status === 'paused' ? (
                                <DropdownMenuItem onSelect={() => void setStatus.run(source, 'cancelled')}>{t('income.cancelSource')}</DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(source)}>
                                {t('common.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {active ? (
                        <div className="mt-3 grid gap-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">{t('income.dueOn', { date: format.date(source.nextExpectedDate) })}</span>
                            <span className="tabular">{t('income.progress', { received: format.money(occ.receivedMinor, source.currency), expected: format.money(source.expectedAmountMinor, source.currency) })}</span>
                          </div>
                          <Progress value={(occ.receivedMinor / source.expectedAmountMinor) * 100} aria-label={t('income.progress', { received: format.money(occ.receivedMinor, source.currency), expected: format.money(source.expectedAmountMinor, source.currency) })} />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">{occ.remainingMinor > 0 ? t('income.remainingLine', { amount: format.money(occ.remainingMinor, source.currency) }) : null}</span>
                            <Button size="sm" variant="outline" onClick={() => setReceiving(source)}>
                              <CheckIcon /> {t('income.markReceived')}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('income.upcoming')}</CardTitle>
            <CardDescription>{t('income.upcomingText')}</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState icon={TrendingUpIcon} title={t('income.nothingExpected')} />
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 10).map(({ source, occurrence }) => (
                  <li key={`${source.id}-${occurrence.dueDate}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-muted-foreground">{format.date(occurrence.dueDate)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Money minor={occurrence.remainingMinor} currency={occurrence.currency} className="text-sm text-muted-foreground" />
                      <StateBadge state={occurrence.state} overdue={occurrence.overdue} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('income.trend')}</CardTitle>
            <CardDescription>{t('income.trendText', { currency })}</CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart buckets={monthly} currency={currency} granularity="month" showExpenses={false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('income.bySource')}</CardTitle>
            <CardDescription>{format.range(period.range)}</CardDescription>
          </CardHeader>
          <CardContent>
            {bySource.length === 0 ? (
              <EmptyState icon={TrendingUpIcon} title={t('income.noReceived')} />
            ) : (
              <ul className="grid gap-2 text-sm">
                {bySource.map((row) => (
                  <li key={row.sourceId ?? 'none'} className="flex items-center justify-between gap-3">
                    <span className="truncate">{sourceName(row.sourceId)}</span>
                    <Money minor={row.totalMinor} currency={currency} />
                  </li>
                ))}
              </ul>
            )}
            {byCategory.length > 0 ? (
              <div className="mt-6">
                <p className="mb-3 text-sm font-medium">{t('income.byCategory')}</p>
                <CategoryBars items={byCategory} currency={currency} type="income" limit={5} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 gap-0 py-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b py-4">
          <div>
            <CardTitle>{t('income.receivedRecords')}</CardTitle>
            <CardDescription>{t('income.receivedRecordsText')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <DownloadIcon /> {t('common.exportCsv')}
          </Button>
        </CardHeader>
        {received.length === 0 ? (
          <EmptyState icon={TrendingUpIcon} title={t('income.noReceived')} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-4">{t('common.date')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('income.sources')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('common.account')}</TableHead>
                  <TableHead className="pe-4 text-end">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {received.slice(0, 50).map((tx) => (
                  <TableRow key={tx.id} className="cursor-pointer" onClick={() => txDialogs.openDetails(tx)}>
                    <TableCell className="ps-4 text-muted-foreground tabular">{format.date(tx.date)}</TableCell>
                    <TableCell className="max-w-56 truncate font-medium">{tx.description}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{sourceName(tx.incomeSourceId)}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{accounts.name(tx.accountId)}</TableCell>
                    <TableCell className="pe-4 text-end">
                      <Money minor={tx.amountMinor} currency={tx.currency} type="income" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <IncomeSourceFormDialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} source={form.source} />
      <ReceiveIncomeDialog source={receiving} onOpenChange={(open) => !open && setReceiving(null)} />
      <ConfirmDialog
        open={skipping !== null}
        onOpenChange={(open) => !open && setSkipping(null)}
        title={t('income.skipTitle')}
        description={
          skipping ? (
            <p>
              {t('income.skipText', {
                date: format.date(skipping.nextExpectedDate),
                next: (() => {
                  const next = nextIncomeDate(skipping, skipping.nextExpectedDate)
                  return next ? format.date(next) : '—'
                })(),
              })}
            </p>
          ) : null
        }
        confirmLabel={t('income.skip')}
        destructive={false}
        onConfirm={async () => (skipping ? (await skip.run(skipping)).status !== 'error' : true)}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('income.deleteTitle')}
        description={<p>{t('income.deleteText', { name: toDelete?.name ?? '' })}</p>}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : true)}
      />
      {txDialogs.dialogs}
    </>
  )
}
