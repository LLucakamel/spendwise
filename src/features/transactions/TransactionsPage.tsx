import {
  ArrowLeftRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  SlidersHorizontalIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useRepository, useSession } from '@/app/session'
import { Money } from '@/components/common/Money'
import { AccountSelect, CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import { PAYMENT_METHODS, TRANSACTION_TYPES, type Transaction, type TransactionType } from '@/domain/types'
import { useAccountLookup, useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { downloadTextFile, transactionsToCsv } from '@/lib/csv'
import { todayIso } from '@/lib/dates'
import { totalsByCurrency } from '@/lib/finance'
import { applyTransactionFilters, EMPTY_FILTERS, filtersFromParams, filtersToParams, hasActiveFilters, SORT_OPTIONS, type TransactionFilters } from '@/lib/transactionFilters'
import { useTransactionDialogs } from './useTransactionDialogs'

const PAGE_SIZE = 25

function CategoryDot({ color }: { color: string }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
}

export function TransactionsPage() {
  const { transactions } = useFinance()
  const { basePath } = useSession()
  const repo = useRepository()
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const accounts = useAccountLookup()
  const dialogs = useTransactionDialogs()
  const [params, setParams] = useSearchParams()
  const filters = filtersFromParams(params)
  const page = Math.max(1, Number(params.get('page')) || 1)
  const storageKey = `spendwise.filters.${basePath}`
  // Advanced filters open automatically whenever one of them is active, unless the user toggles the panel.
  const [showMoreChoice, setShowMore] = useState<boolean | null>(null)
  const showMore = showMoreChoice ?? Boolean(filters.minAmount || filters.maxAmount || filters.paymentMethod || filters.accountId || filters.origin || filters.reconciled)

  const reconcile = useMutation((tx: Transaction, value: boolean) => repo.update('transactions', tx.id, { reconciled: value }), { success: 'toast.saved' })

  // Keep the last filters for this tab so returning to the page restores them.
  useEffect(() => {
    const own = new URLSearchParams(params)
    own.delete('open')
    own.delete('new')
    try {
      if (own.toString()) sessionStorage.setItem(storageKey, own.toString())
    } catch {
      // Not critical.
    }
  }, [params, storageKey])
  useEffect(() => {
    if (params.toString()) return
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setParams(new URLSearchParams(saved), { replace: true })
    } catch {
      // Not critical.
    }
    // Only on the first visit without parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep links: ?open=<id> from search, ?new=<type> from Quick add.
  const openId = params.get('open')
  const newType = params.get('new')
  useEffect(() => {
    if (!openId && !newType) return
    if (openId) {
      const target = transactions.find((tx) => tx.id === openId)
      if (target) dialogs.openDetails(target)
    }
    if (newType && (TRANSACTION_TYPES as readonly string[]).includes(newType)) dialogs.openCreate({ type: newType as TransactionType })
    const next = new URLSearchParams(params)
    next.delete('open')
    next.delete('new')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, newType])

  const filtered = useMemo(
    () => applyTransactionFilters(transactions, filters, lookup.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is derived from params
    [transactions, params, lookup],
  )
  const totals = useMemo(() => totalsByCurrency(filtered), [filtered])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const active = hasActiveFilters(filters)

  // Build on the latest URL state so quick successive changes never restore an older value.
  const update = (patch: Partial<TransactionFilters>) => setParams((current) => filtersToParams({ ...filtersFromParams(current), ...patch }), { replace: true })
  const clearFilters = () => {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // Not critical.
    }
    setParams(filtersToParams(EMPTY_FILTERS), { replace: true })
  }
  const goToPage = (next: number) => {
    const nextParams = filtersToParams(filters)
    if (next > 1) nextParams.set('page', String(next))
    setParams(nextParams, { replace: true })
  }
  const needle = filters.query.trim().toLocaleLowerCase().slice(0, 3)
  const { categories } = useFinance()
  const suggestions = needle ? categories.filter((c) => lookup.name(c.id).toLocaleLowerCase().includes(needle)).slice(0, 4) : []

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info(t('toast.nothingToExport'))
      return
    }
    downloadTextFile(`spendwise-transactions-${todayIso()}.csv`, transactionsToCsv(filtered, { category: lookup.name, account: accounts.name }), 'text/csv', true)
    toast.success(t('toast.exported', { count: filtered.length }))
  }

  const rowMenu = (tx: Transaction) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('common.actionsFor', { name: tx.description })}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => dialogs.openDetails(tx)}>{t('transactions.viewDetails')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => dialogs.openEdit(tx)}>{t('common.edit')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void reconcile.run(tx, !tx.reconciled)}>
          {tx.reconciled ? t('transactions.markUnreconciled') : t('transactions.markReconciled')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => dialogs.requestDelete(tx)}>
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const secondaryLine = (tx: Transaction) =>
    tx.type === 'transfer' ? t('txDetails.fromTo', { from: accounts.name(tx.accountId), to: accounts.name(tx.toAccountId) }) : lookup.name(tx.categoryId)

  return (
    <>
      <PageHeader
        title={t('transactions.title')}
        description={t('transactions.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={transactions.length === 0}>
              <DownloadIcon /> {t('common.exportCsv')}
            </Button>
            <Button onClick={() => dialogs.openCreate()}>
              <PlusIcon /> {t('transactions.add')}
            </Button>
          </>
        }
      />

      <Card className="mb-4 gap-0 py-0">
        <CardContent className="grid gap-3 p-4">
          <div className="relative">
            <Label htmlFor="tx-search" className="sr-only">
              {t('transactions.searchLabel')}
            </Label>
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="tx-search" type="search" placeholder={t('transactions.searchPlaceholder')} className="ps-9" value={filters.query} onChange={(e) => update({ query: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="grid gap-1">
              <Label htmlFor="f-type" className="text-xs text-muted-foreground">
                {t('common.type')}
              </Label>
              <NativeSelect id="f-type" value={filters.type} onChange={(e) => update({ type: e.target.value as TransactionFilters['type'] })}>
                <option value="">{t('transactions.allTypes')}</option>
                {TRANSACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-category" className="text-xs text-muted-foreground">
                {t('common.category')}
              </Label>
              <CategorySelect id="f-category" allowAll value={filters.categoryId} onChange={(e) => update({ categoryId: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-currency" className="text-xs text-muted-foreground">
                {t('common.currency')}
              </Label>
              <CurrencySelect id="f-currency" allowAll value={filters.currency} onChange={(e) => update({ currency: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-from" className="text-xs text-muted-foreground">
                {t('common.from')}
              </Label>
              <Input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-to" className="text-xs text-muted-foreground">
                {t('common.to')}
              </Label>
              <Input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-sort" className="text-xs text-muted-foreground">
                {t('transactions.sort')}
              </Label>
              <NativeSelect id="f-sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as TransactionFilters['sort'] })}>
                {SORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {t(`transactions.sortOptions.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {showMore ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="grid gap-1">
                <Label htmlFor="f-min" className="text-xs text-muted-foreground">
                  {t('transactions.minAmount')}
                </Label>
                <Input id="f-min" inputMode="decimal" dir="ltr" placeholder={t('transactions.any')} value={filters.minAmount} onChange={(e) => update({ minAmount: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-max" className="text-xs text-muted-foreground">
                  {t('transactions.maxAmount')}
                </Label>
                <Input id="f-max" inputMode="decimal" dir="ltr" placeholder={t('transactions.any')} value={filters.maxAmount} onChange={(e) => update({ maxAmount: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-method" className="text-xs text-muted-foreground">
                  {t('transactions.paymentMethod')}
                </Label>
                <NativeSelect id="f-method" value={filters.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value as TransactionFilters['paymentMethod'] })}>
                  <option value="">{t('transactions.anyMethod')}</option>
                  <option value="none">{t('paymentMethods.none')}</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`paymentMethods.${m}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-account" className="text-xs text-muted-foreground">
                  {t('common.account')}
                </Label>
                <AccountSelect id="f-account" emptyLabel={t('transactions.allAccounts')} value={filters.accountId} onChange={(e) => update({ accountId: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-origin" className="text-xs text-muted-foreground">
                  {t('transactions.origin')}
                </Label>
                <NativeSelect id="f-origin" value={filters.origin} onChange={(e) => update({ origin: e.target.value as TransactionFilters['origin'] })}>
                  <option value="">{t('transactions.anyOrigin')}</option>
                  <option value="manual">{t('origins.manual')}</option>
                  <option value="import">{t('origins.import')}</option>
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="f-reconciled" className="text-xs text-muted-foreground">
                  {t('transactions.reconciliation')}
                </Label>
                <NativeSelect id="f-reconciled" value={filters.reconciled} onChange={(e) => update({ reconciled: e.target.value as TransactionFilters['reconciled'] })}>
                  <option value="">{t('transactions.anyReconciliation')}</option>
                  <option value="yes">{t('transactions.reconciled')}</option>
                  <option value="no">{t('transactions.unreconciled')}</option>
                </NativeSelect>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground md:col-span-3 xl:col-span-6">{t('transactions.amountsNote')}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground" aria-live="polite">
              <span data-testid="tx-count">{t('transactions.count', { shown: filtered.length, total: transactions.length })}</span>
              {totals.map((tot) => (
                <span key={tot.currency}>
                  {' · '}
                  {t('transactions.netLine', { currency: tot.currency, amount: '' })}
                  <Money minor={tot.netMinor} currency={tot.currency} tone="signed" />
                </span>
              ))}
            </p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
                <SlidersHorizontalIcon /> {showMore ? t('common.fewerFilters') : t('common.moreFilters')}
              </Button>
              {active ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XIcon /> {t('common.clearFilters')}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        {transactions.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRightIcon}
            title={t('transactions.emptyTitle')}
            description={t('transactions.emptyText')}
            action={
              <Button onClick={() => dialogs.openCreate()}>
                <PlusIcon /> {t('transactions.add')}
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SearchXIcon}
            title={t('transactions.noMatchTitle')}
            description={
              suggestions.length > 0 ? (
                <>
                  {t('transactions.tryCategory')}{' '}
                  {suggestions.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 ? '، ' : ''}
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => update({ query: '', categoryId: c.id })}>
                        {lookup.name(c.id)}
                      </button>
                    </span>
                  ))}
                </>
              ) : (
                t('transactions.noMatchText')
              )
            }
            action={
              <Button variant="outline" onClick={clearFilters}>
                {t('common.clearFilters')}
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32 ps-4">{t('common.date')}</TableHead>
                    <TableHead>{t('common.description')}</TableHead>
                    <TableHead>{t('common.category')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t('common.account')}</TableHead>
                    <TableHead className="text-end">{t('common.amount')}</TableHead>
                    <TableHead className="w-12 pe-4">
                      <span className="sr-only">{t('common.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="ps-4 text-muted-foreground tabular">{format.date(tx.date)}</TableCell>
                      <TableCell className="max-w-72">
                        <button type="button" className="block max-w-full truncate text-start font-medium hover:underline focus-visible:underline focus-visible:outline-none" onClick={() => dialogs.openDetails(tx)}>
                          {tx.description}
                        </button>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {tx.type === 'refund' || tx.type === 'transfer' ? <span>{t(`types.${tx.type}`)}</span> : null}
                          {tx.origin === 'import' ? <span>· {t('origins.import')}</span> : null}
                          {tx.reconciled ? <CheckCircle2Icon className="size-3 text-income" aria-label={t('transactions.reconciled')} /> : null}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <CategoryDot color={lookup.color(tx.categoryId)} />
                          {secondaryLine(tx)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{tx.type === 'transfer' ? '' : accounts.name(tx.accountId)}</TableCell>
                      <TableCell className="text-end font-medium">
                        <Money minor={tx.amountMinor} currency={tx.currency} type={tx.type} />
                      </TableCell>
                      <TableCell className="pe-4">{rowMenu(tx)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y md:hidden">
              {visible.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => dialogs.openDetails(tx)}>
                    <CategoryDot color={lookup.color(tx.categoryId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tx.description}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {format.date(tx.date)} · {secondaryLine(tx)}
                      </span>
                    </span>
                    <Money minor={tx.amountMinor} currency={tx.currency} type={tx.type} className="text-sm font-medium" />
                  </button>
                  {rowMenu(tx)}
                </li>
              ))}
            </ul>
            {pageCount > 1 ? (
              <nav aria-label={t('common.pagination')} className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">{t('common.page', { page: currentPage, pages: pageCount })}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                    <ChevronLeftIcon className="rtl:-scale-x-100" /> {t('common.previous')}
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => goToPage(currentPage + 1)}>
                    {t('common.next')} <ChevronRightIcon className="rtl:-scale-x-100" />
                  </Button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </Card>
      {dialogs.dialogs}
    </>
  )
}
