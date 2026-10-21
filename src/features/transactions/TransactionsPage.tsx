import {
  ArrowLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Money } from '@/components/common/Money'
import { CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import type { Transaction } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { downloadTextFile, transactionsToCsv } from '@/lib/csv'
import { todayIso } from '@/lib/dates'
import { totalsByCurrency } from '@/lib/finance'
import {
  applyTransactionFilters,
  EMPTY_FILTERS,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
  SORT_LABELS,
  SORT_OPTIONS,
  type TransactionFilters,
} from '@/lib/transactionFilters'
import { useTransactionDialogs } from './useTransactionDialogs'

const PAGE_SIZE = 25

function CategoryDot({ color }: { color: string }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
}

function RowActions({ t, onDetails, onEdit, onDelete }: { t: Transaction; onDetails(): void; onEdit(): void; onDelete(): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.description}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDetails}>View details</DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TransactionsPage() {
  const { transactions, categories, settings } = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const dialogs = useTransactionDialogs()
  const [params, setParams] = useSearchParams()
  const filters = filtersFromParams(params)
  const page = Math.max(1, Number(params.get('page')) || 1)

  const filtered = useMemo(
    () => applyTransactionFilters(transactions, filters, lookup.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is derived from params
    [transactions, params, lookup],
  )
  const totals = useMemo(() => totalsByCurrency(filtered, settings.displayCurrency), [filtered, settings.displayCurrency])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const active = hasActiveFilters(filters)

  const update = (patch: Partial<TransactionFilters>) => {
    setParams(filtersToParams({ ...filters, ...patch }), { replace: true })
  }
  const goToPage = (next: number) => {
    const nextParams = filtersToParams(filters)
    if (next > 1) nextParams.set('page', String(next))
    setParams(nextParams, { replace: true })
  }

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info('There are no transactions to export.')
      return
    }
    downloadTextFile(`spendwise-transactions-${todayIso()}.csv`, transactionsToCsv(filtered, categories), 'text/csv', true)
    toast.success(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`)
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Search, filter and manage every income and expense you’ve recorded."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={transactions.length === 0}>
              <DownloadIcon /> Export CSV
            </Button>
            <Button onClick={() => dialogs.openCreate()}>
              <PlusIcon /> Add transaction
            </Button>
          </>
        }
      />

      <Card className="mb-4 gap-0 py-0">
        <CardContent className="grid gap-3 p-4">
          <div className="relative">
            <Label htmlFor="tx-search" className="sr-only">
              Search transactions
            </Label>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="tx-search"
              type="search"
              placeholder="Search description, notes or category"
              className="pl-9"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="grid gap-1">
              <Label htmlFor="f-type" className="text-xs text-muted-foreground">Type</Label>
              <NativeSelect id="f-type" value={filters.type} onChange={(e) => update({ type: e.target.value as TransactionFilters['type'] })}>
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </NativeSelect>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-category" className="text-xs text-muted-foreground">Category</Label>
              <CategorySelect id="f-category" allowAll value={filters.categoryId} onChange={(e) => update({ categoryId: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-currency" className="text-xs text-muted-foreground">Currency</Label>
              <CurrencySelect id="f-currency" allowAll value={filters.currency} onChange={(e) => update({ currency: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="f-sort" className="text-xs text-muted-foreground">Sort</Label>
              <NativeSelect id="f-sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as TransactionFilters['sort'] })}>
                {SORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{SORT_LABELS[s]}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground" aria-live="polite">
              {filtered.length} of {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
              {totals.length > 0 ? (
                <>
                  {' · '}
                  {totals.map((t, i) => (
                    <span key={t.currency}>
                      {i > 0 ? ' · ' : ''}
                      {t.currency} net <Money minor={t.netMinor} currency={t.currency} tone="signed" />
                    </span>
                  ))}
                </>
              ) : null}
            </p>
            {active ? (
              <Button variant="ghost" size="sm" onClick={() => setParams(filtersToParams(EMPTY_FILTERS), { replace: true })}>
                <XIcon /> Clear filters
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        {transactions.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRightIcon}
            title="No transactions yet"
            description="Add your first income or expense to start tracking where your money goes."
            action={
              <Button onClick={() => dialogs.openCreate()}>
                <PlusIcon /> Add transaction
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SearchXIcon}
            title="No matching transactions"
            description="Try a different search term or clear the filters."
            action={
              <Button variant="outline" onClick={() => setParams(filtersToParams(EMPTY_FILTERS), { replace: true })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32 pl-4">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4 text-muted-foreground tabular">{format.date(t.date)}</TableCell>
                      <TableCell className="max-w-72">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                          onClick={() => dialogs.openDetails(t)}
                        >
                          {t.description}
                        </button>
                        {t.notes ? <p className="truncate text-xs text-muted-foreground">{t.notes}</p> : null}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <CategoryDot color={lookup.color(t.categoryId)} />
                          {lookup.name(t.categoryId)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money minor={t.amountMinor} currency={t.currency} type={t.type} />
                      </TableCell>
                      <TableCell className="pr-4">
                        <RowActions
                          t={t}
                          onDetails={() => dialogs.openDetails(t)}
                          onEdit={() => dialogs.openEdit(t)}
                          onDelete={() => dialogs.requestDelete(t)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile list */}
            <ul className="divide-y md:hidden">
              {visible.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => dialogs.openDetails(t)}>
                    <CategoryDot color={lookup.color(t.categoryId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.description}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {format.date(t.date)} · {lookup.name(t.categoryId)}
                      </span>
                    </span>
                    <Money minor={t.amountMinor} currency={t.currency} type={t.type} className="text-sm font-medium" />
                  </button>
                  <RowActions
                    t={t}
                    onDetails={() => dialogs.openDetails(t)}
                    onEdit={() => dialogs.openEdit(t)}
                    onDelete={() => dialogs.requestDelete(t)}
                  />
                </li>
              ))}
            </ul>
            {pageCount > 1 ? (
              <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  Page {currentPage} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                    <ChevronLeftIcon /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => goToPage(currentPage + 1)}>
                    Next <ChevronRightIcon />
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
