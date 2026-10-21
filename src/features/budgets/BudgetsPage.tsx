import { ChevronLeftIcon, ChevronRightIcon, InfoIcon, MoreHorizontalIcon, PiggyBankIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppPath, useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { useFinance } from '@/data/DataProvider'
import type { Budget } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { addMonthsToMonth, monthOf, monthRange, todayIso } from '@/lib/dates'
import { budgetAppliesToMonth, budgetUsage } from '@/lib/finance'
import { BudgetFormDialog } from './BudgetFormDialog'
import { BudgetHealthBadge, budgetIndicatorClass } from './budgetUi'

export function BudgetsPage() {
  const { budgets, transactions } = useFinance()
  const repo = useRepository()
  const appPath = useAppPath()
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const thisMonth = monthOf(todayIso())
  const [month, setMonth] = useState(thisMonth)
  const [form, setForm] = useState<{ open: boolean; budget?: Budget }>({ open: false })
  const [toDelete, setToDelete] = useState<Budget | null>(null)
  const remove = useMutation((id: string) => repo.deleteBudget(id), { success: 'budgets.form.deleted', errorPrefix: 'toast.couldNotDelete' })

  const rows = useMemo(
    () =>
      budgets
        .map((budget) => ({ budget, applies: budgetAppliesToMonth(budget, month), usage: budgetUsage(budget, transactions, month) }))
        .sort((a, b) => Number(b.applies) - Number(a.applies) || a.budget.name.localeCompare(b.budget.name)),
    [budgets, transactions, month],
  )
  const active = rows.filter((r) => r.applies)
  const inactive = rows.filter((r) => !r.applies)
  const range = monthRange(month)
  const period = (budget: Budget) =>
    budget.endMonth
      ? t('budgets.range', { start: format.month(budget.startMonth), end: format.month(budget.endMonth) })
      : t('budgets.since', { month: format.month(budget.startMonth) })

  return (
    <>
      <PageHeader
        title={t('budgets.title')}
        description={t('budgets.subtitle')}
        actions={
          <Button onClick={() => setForm({ open: true })}>
            <PlusIcon /> {t('budgets.new')}
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label={t('budgets.previousMonth')} onClick={() => setMonth((m) => addMonthsToMonth(m, -1))}>
          <ChevronLeftIcon className="rtl:-scale-x-100" />
        </Button>
        <h2 className="min-w-40 text-center text-sm font-semibold" aria-live="polite">
          {format.month(month)}
        </h2>
        <Button variant="outline" size="icon-sm" aria-label={t('budgets.nextMonth')} onClick={() => setMonth((m) => addMonthsToMonth(m, 1))}>
          <ChevronRightIcon className="rtl:-scale-x-100" />
        </Button>
        {month !== thisMonth ? (
          <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth)}>
            {t('budgets.thisMonth')}
          </Button>
        ) : null}
      </div>

      {budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBankIcon}
            title={t('budgets.emptyTitle')}
            description={t('budgets.emptyText')}
            action={
              <Button onClick={() => setForm({ open: true })}>
                <PlusIcon /> {t('budgets.createFirst')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {active.length === 0 ? (
            <Card className="mb-4">
              <EmptyState icon={PiggyBankIcon} title={t('budgets.noneThisMonth', { month: format.month(month) })} description={t('budgets.noneThisMonthText')} />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {active.map(({ budget, usage }) => {
                const percent = Math.round(usage.ratio * 100)
                const percentText = format.number(percent)
                return (
                  <Card key={budget.id} className="gap-4">
                    <CardHeader>
                      <CardTitle className="truncate">{budget.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: lookup.color(budget.categoryId) }} aria-hidden="true" />
                        {lookup.name(budget.categoryId)} · {budget.currency}
                      </CardDescription>
                      <CardAction>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t('common.actionsFor', { name: budget.name })}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setForm({ open: true, budget })}>{t('common.edit')}</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link
                                to={`${appPath('/transactions')}?${new URLSearchParams({ category: budget.categoryId, currency: budget.currency, type: 'expense', from: range.from, to: range.to })}`}
                              >
                                {t('budgets.viewTransactions')}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(budget)}>
                              {t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <div className="flex items-end justify-between gap-2">
                        <p className="text-2xl font-semibold tabular">{format.money(usage.spentMinor, budget.currency)}</p>
                        <p className="pb-1 text-sm text-muted-foreground tabular">{t('budgets.of', { limit: format.money(budget.limitMinor, budget.currency) })}</p>
                      </div>
                      <Progress
                        value={usage.ratio * 100}
                        indicatorClassName={budgetIndicatorClass(usage.health)}
                        aria-label={t('budgets.progressLabel', { name: budget.name, percent: percentText })}
                      />
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <BudgetHealthBadge health={usage.health} />
                        <span className="tabular text-muted-foreground">
                          {t('budgets.used', { percent: percentText })} ·{' '}
                          {usage.remainingMinor >= 0 ? (
                            t('budgets.left', { amount: format.money(usage.remainingMinor, budget.currency) })
                          ) : (
                            <span className="font-medium text-expense">{t('budgets.over', { amount: format.money(-usage.remainingMinor, budget.currency) })}</span>
                          )}
                        </span>
                      </div>
                      {usage.health === 'warning' ? (
                        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs">{t('budgets.nearWarning', { percent: percentText })}</p>
                      ) : usage.health === 'over' ? (
                        <p className="rounded-md bg-expense-soft px-3 py-2 text-xs">
                          {t('budgets.overWarning', { amount: format.money(-usage.remainingMinor, budget.currency) })}
                        </p>
                      ) : null}
                      {usage.otherCurrencyCount > 0 ? (
                        <p className="flex gap-1.5 text-xs text-muted-foreground">
                          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                          {t('budgets.otherCurrency', { count: usage.otherCurrencyCount })}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {t('budgets.counted', { count: usage.transactionCount })} · {period(budget)}
                      </p>
                      {budget.notes ? (
                        <p className="text-xs text-muted-foreground italic" dir="auto">
                          {budget.notes}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {inactive.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('budgets.notActive', { month: format.month(month) })}</h2>
              <Card className="py-0">
                <ul className="divide-y">
                  {inactive.map(({ budget }) => (
                    <li key={budget.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{budget.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('budgets.perMonth', { amount: format.money(budget.limitMinor, budget.currency) })} · {period(budget)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, budget })}>
                          {t('common.edit')}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setToDelete(budget)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
          <p className="mt-6 flex gap-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t('budgets.note')}
          </p>
        </>
      )}

      <BudgetFormDialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} budget={form.budget} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('budgets.deleteTitle')}
        description={<p>{t('budgets.deleteText', { name: toDelete?.name ?? '' })}</p>}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : true)}
      />
    </>
  )
}
