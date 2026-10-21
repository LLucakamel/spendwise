import { ChevronLeftIcon, ChevronRightIcon, InfoIcon, MoreHorizontalIcon, PiggyBankIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useRepository } from '@/app/session'
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
import { addMonthsToMonth, monthOf, monthRange, todayIso } from '@/lib/dates'
import { budgetAppliesToMonth, budgetUsage } from '@/lib/finance'
import { BudgetFormDialog } from './BudgetFormDialog'
import { BudgetHealthBadge, budgetIndicatorClass } from './budgetUi'

export function BudgetsPage() {
  const { budgets, transactions } = useFinance()
  const repo = useRepository()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const thisMonth = monthOf(todayIso())
  const [month, setMonth] = useState(thisMonth)
  const [form, setForm] = useState<{ open: boolean; budget?: Budget }>({ open: false })
  const [toDelete, setToDelete] = useState<Budget | null>(null)
  const remove = useMutation((id: string) => repo.deleteBudget(id), { success: 'Budget deleted', errorPrefix: 'Couldn’t delete the budget.' })

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

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly spending limits per expense category. Spending is calculated from your recorded expenses."
        actions={
          <Button onClick={() => setForm({ open: true })}>
            <PlusIcon /> New budget
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonthsToMonth(m, -1))}>
          <ChevronLeftIcon />
        </Button>
        <h2 className="min-w-40 text-center text-sm font-semibold" aria-live="polite">
          {format.month(month)}
        </h2>
        <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonthsToMonth(m, 1))}>
          <ChevronRightIcon />
        </Button>
        {month !== thisMonth ? (
          <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth)}>
            This month
          </Button>
        ) : null}
      </div>

      {budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBankIcon}
            title="No budgets yet"
            description="Create a monthly limit for a category, such as groceries or dining out, and SpendWise will track your spending against it."
            action={
              <Button onClick={() => setForm({ open: true })}>
                <PlusIcon /> Create your first budget
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {active.length === 0 ? (
            <Card className="mb-4">
              <EmptyState icon={PiggyBankIcon} title={`No budgets apply to ${format.month(month)}`} description="Budgets outside their month range are listed below." />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {active.map(({ budget, usage }) => {
                const percent = Math.round(usage.ratio * 100)
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
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${budget.name}`}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setForm({ open: true, budget })}>Edit</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/transactions?${new URLSearchParams({ category: budget.categoryId, currency: budget.currency, type: 'expense', from: range.from, to: range.to })}`}>
                                View transactions
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(budget)}>
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <div className="flex items-end justify-between gap-2">
                        <p className="text-2xl font-semibold tabular">{format.money(usage.spentMinor, budget.currency)}</p>
                        <p className="pb-1 text-sm text-muted-foreground tabular">of {format.money(budget.limitMinor, budget.currency)}</p>
                      </div>
                      <Progress
                        value={usage.ratio * 100}
                        indicatorClassName={budgetIndicatorClass(usage.health)}
                        aria-label={`${budget.name}: ${percent}% of the limit used`}
                      />
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <BudgetHealthBadge health={usage.health} />
                        <span className="tabular text-muted-foreground">
                          {percent}% used ·{' '}
                          {usage.remainingMinor >= 0 ? (
                            <>{format.money(usage.remainingMinor, budget.currency)} left</>
                          ) : (
                            <span className="font-medium text-expense">{format.money(-usage.remainingMinor, budget.currency)} over</span>
                          )}
                        </span>
                      </div>
                      {usage.health === 'warning' ? (
                        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs">You’ve used {percent}% of this budget. Consider slowing down for the rest of the month.</p>
                      ) : usage.health === 'over' ? (
                        <p className="rounded-md bg-expense-soft px-3 py-2 text-xs">This budget is exceeded by {format.money(-usage.remainingMinor, budget.currency)}.</p>
                      ) : null}
                      {usage.otherCurrencyCount > 0 ? (
                        <p className="flex gap-1.5 text-xs text-muted-foreground">
                          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                          {usage.otherCurrencyCount} expense{usage.otherCurrencyCount === 1 ? '' : 's'} in this category used another currency and
                          {usage.otherCurrencyCount === 1 ? ' is' : ' are'} not counted here.
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {usage.transactionCount} expense{usage.transactionCount === 1 ? '' : 's'} counted ·{' '}
                        {budget.endMonth ? `${format.month(budget.startMonth)} – ${format.month(budget.endMonth)}` : `Since ${format.month(budget.startMonth)}`}
                      </p>
                      {budget.notes ? <p className="text-xs text-muted-foreground italic">{budget.notes}</p> : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {inactive.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Not active in {format.month(month)}</h2>
              <Card className="py-0">
                <ul className="divide-y">
                  {inactive.map(({ budget }) => (
                    <li key={budget.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{budget.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format.money(budget.limitMinor, budget.currency)} per month ·{' '}
                          {budget.endMonth ? `${format.month(budget.startMonth)} – ${format.month(budget.endMonth)}` : `From ${format.month(budget.startMonth)}`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, budget })}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setToDelete(budget)}>
                          Delete
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
            Each budget counts only expenses in its own category and currency. SpendWise doesn’t convert currencies, so a category with spending in
            several currencies needs one budget per currency.
          </p>
        </>
      )}

      <BudgetFormDialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} budget={form.budget} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this budget?"
        description={<p>“{toDelete?.name}” will be removed. Your transactions are not affected.</p>}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : true)}
      />
    </>
  )
}
