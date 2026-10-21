import { CalendarClockIcon, CheckIcon, InfoIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useFinance } from '@/data/DataProvider'
import type { RecurringBill } from '@/domain/types'
import { useAccountLookup, useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { addMinor } from '@/lib/money'
import { advanceDueDate, approximateMonthlyCost, billTiming, DUE_SOON_DAYS } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import { BillFormDialog } from './BillFormDialog'
import { BillTimingBadge } from './billUi'
import { MarkPaidDialog } from './MarkPaidDialog'
import { PaymentHistoryDialog } from './PaymentHistoryDialog'

export function RecurringPage() {
  const { recurringBills, settings } = useFinance()
  const displayCurrency = settings.displayCurrency
  const repo = useRepository()
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const accounts = useAccountLookup()
  const today = todayIso()
  const [form, setForm] = useState<{ open: boolean; bill?: RecurringBill }>({ open: false })
  const [paying, setPaying] = useState<RecurringBill | null>(null)
  const [skipping, setSkipping] = useState<RecurringBill | null>(null)
  const [toDelete, setToDelete] = useState<RecurringBill | null>(null)
  const [history, setHistory] = useState<RecurringBill | null>(null)
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const statusFilter = params.get('status') ?? ''
  const setFilter = (key: 'q' | 'status', value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const setStatus = useMutation((bill: RecurringBill, status: RecurringBill['status']) => repo.updateRecurringBill(bill.id, { status }), {
    success: 'bills.updated',
    errorPrefix: 'toast.couldNotSave',
  })
  const skip = useMutation((bill: RecurringBill) => repo.skipBillOccurrence(bill), {
    success: 'bills.skipped',
    errorPrefix: 'toast.couldNotSave',
    queuesOffline: false,
  })
  const remove = useMutation((id: string) => repo.deleteRecurringBill(id), { success: 'bills.deleted', errorPrefix: 'toast.couldNotDelete' })

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const visible = recurringBills.filter((b) => {
      if (statusFilter === 'overdue' ? billTiming(b, today) !== 'overdue' : statusFilter && b.status !== statusFilter) return false
      return !needle || b.name.toLocaleLowerCase().includes(needle) || b.notes.toLocaleLowerCase().includes(needle)
    })
    const sorted = [...visible].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.name.localeCompare(b.name))
    return {
      overdue: sorted.filter((b) => billTiming(b, today) === 'overdue'),
      upcoming: sorted.filter((b) => ['due-today', 'due-soon', 'scheduled'].includes(billTiming(b, today))),
      inactive: sorted.filter((b) => b.status !== 'active'),
    }
  }, [recurringBills, today, query, statusFilter])

  const monthlyByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const bill of recurringBills) {
      if (bill.status !== 'active') continue
      map.set(bill.currency, addMinor(map.get(bill.currency) ?? 0, approximateMonthlyCost(bill)))
    }
    return [...map.entries()].sort(([a], [b]) => (a === displayCurrency ? -1 : b === displayCurrency ? 1 : a.localeCompare(b)))
  }, [recurringBills, displayCurrency])

  const dueSoonCount = groups.upcoming.filter((b) => billTiming(b, today) !== 'scheduled').length

  const renderBillRow = (bill: RecurringBill) => {
    const canPay = bill.status === 'active'
    const details = [
      t(`frequencies.${bill.frequency}`),
      lookup.name(bill.categoryId),
      bill.accountId ? accounts.name(bill.accountId) : null,
      bill.status === 'ended' ? null : t('bills.next', { date: format.date(bill.nextDueDate) }),
      bill.endDate ? t('bills.ends', { date: format.date(bill.endDate) }) : null,
    ].filter(Boolean)
    return (
      <li key={bill.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: lookup.color(bill.categoryId) }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{bill.name}</p>
            <p className="truncate text-xs text-muted-foreground">{details.join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-nowrap sm:justify-end">
          <BillTimingBadge bill={bill} today={today} />
          <Money minor={bill.amountMinor} currency={bill.currency} className="w-28 text-end text-sm font-medium" />
          <div className="flex items-center gap-1">
            {canPay ? (
              <Button variant="outline" size="sm" onClick={() => setPaying(bill)}>
                <CheckIcon /> {t('bills.markPaid')}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('common.actionsFor', { name: bill.name })}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setForm({ open: true, bill })}>{t('common.edit')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHistory(bill)}>{t('bills.history')}</DropdownMenuItem>
                {bill.status === 'active' ? (
                  <>
                    <DropdownMenuItem onSelect={() => setSkipping(bill)}>{t('bills.skip')}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void setStatus.run(bill, 'paused')}>{t('bills.pause')}</DropdownMenuItem>
                  </>
                ) : bill.status === 'paused' ? (
                  <DropdownMenuItem onSelect={() => void setStatus.run(bill, 'active')}>{t('bills.resume')}</DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(bill)}>
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </li>
    )
  }

  const renderSection = (title: string, bills: RecurringBill[], description?: string) =>
    bills.length === 0 ? null : (
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">
            {title} <span className="font-normal text-muted-foreground">({format.number(bills.length)})</span>
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <ul className="divide-y">{bills.map((b) => renderBillRow(b))}</ul>
      </Card>
    )

  return (
    <>
      <PageHeader
        title={t('bills.title')}
        description={t('bills.subtitle')}
        actions={
          <Button onClick={() => setForm({ open: true })}>
            <PlusIcon /> {t('bills.new')}
          </Button>
        }
      />

      {recurringBills.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClockIcon}
            title={t('bills.emptyTitle')}
            description={t('bills.emptyText')}
            action={
              <Button onClick={() => setForm({ open: true })}>
                <PlusIcon /> {t('bills.addFirst')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="gap-1 py-5">
              <CardContent className="px-5">
                <p className="text-sm text-muted-foreground">{t('bills.overdue')}</p>
                <p className={cn('text-2xl font-semibold', groups.overdue.length && 'text-expense')}>{format.number(groups.overdue.length)}</p>
              </CardContent>
            </Card>
            <Card className="gap-1 py-5">
              <CardContent className="px-5">
                <p className="text-sm text-muted-foreground">{t('bills.dueSoonCount', { days: format.number(DUE_SOON_DAYS) })}</p>
                <p className="text-2xl font-semibold">{format.number(dueSoonCount)}</p>
              </CardContent>
            </Card>
            <Card className="gap-1 py-5">
              <CardContent className="px-5">
                <p className="text-sm text-muted-foreground">{t('bills.monthlyCost')}</p>
                {monthlyByCurrency.length === 0 ? (
                  <p className="text-2xl font-semibold">{t('common.unknown')}</p>
                ) : (
                  monthlyByCurrency.map(([currency, minor]) => (
                    <p key={currency} className="text-2xl font-semibold">
                      <Money minor={minor} currency={currency} />
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-56 flex-1 gap-1">
              <Label htmlFor="bill-search" className="text-xs text-muted-foreground">
                {t('bills.searchLabel')}
              </Label>
              <Input
                id="bill-search"
                type="search"
                dir="auto"
                placeholder={t('bills.searchPlaceholder')}
                value={query}
                onChange={(e) => setFilter('q', e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="bill-status" className="text-xs text-muted-foreground">
                {t('bills.statusLabel')}
              </Label>
              <NativeSelect id="bill-status" value={statusFilter} onChange={(e) => setFilter('status', e.target.value)} className="w-40">
                <option value="">{t('bills.statusAll')}</option>
                <option value="overdue">{t('bills.statusOverdue')}</option>
                <option value="active">{t('bills.statusActive')}</option>
                <option value="paused">{t('bills.statusPaused')}</option>
                <option value="ended">{t('bills.statusEnded')}</option>
              </NativeSelect>
            </div>
          </div>
          {groups.overdue.length + groups.upcoming.length + groups.inactive.length === 0 ? (
            <Card>
              <EmptyState icon={CalendarClockIcon} title={t('bills.noMatch')} description={t('bills.noMatchText')} />
            </Card>
          ) : null}
          {renderSection(t('bills.overdue'), groups.overdue, t('bills.overdueText'))}
          {renderSection(t('bills.upcoming'), groups.upcoming)}
          {renderSection(t('bills.inactive'), groups.inactive)}
          <p className="flex gap-2 text-xs text-muted-foreground">
            <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t('bills.note')}
          </p>
        </div>
      )}

      <BillFormDialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} bill={form.bill} />
      <MarkPaidDialog bill={paying} onOpenChange={(open) => !open && setPaying(null)} />
      <PaymentHistoryDialog bill={history} onOpenChange={(open) => !open && setHistory(null)} />
      <ConfirmDialog
        open={skipping !== null}
        onOpenChange={(open) => !open && setSkipping(null)}
        title={t('bills.skipTitle')}
        description={
          skipping ? (
            <p>
              {t('bills.skipText', {
                date: format.date(skipping.nextDueDate),
                next: format.date(advanceDueDate(skipping.nextDueDate, skipping.frequency, skipping.anchorDay)),
              })}
            </p>
          ) : null
        }
        confirmLabel={t('bills.skipConfirm')}
        destructive={false}
        onConfirm={async () => (skipping ? (await skip.run(skipping)).status !== 'error' : true)}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('bills.deleteTitle')}
        description={<p>{t('bills.deleteText', { name: toDelete?.name ?? '' })}</p>}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : true)}
      />
    </>
  )
}
