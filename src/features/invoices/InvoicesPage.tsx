import { DownloadIcon, PlusIcon, ReceiptTextIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import { CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { EmptyState, PageHeader } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFinance } from '@/data/DataProvider'
import type { Invoice } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { downloadTextFile, recordsToCsv } from '@/lib/csv'
import { todayIso } from '@/lib/dates'
import { invoicePaymentState, merchantSummary, taxSummary, type InvoicePaymentState } from '@/lib/invoice/invoices'
import { addMinor, minorToDecimalString, parseSignedAmountToMinor } from '@/lib/money'
import { daysUntil } from '@/lib/recurring'
import { InvoiceCaptureDialog } from './InvoiceCaptureDialog'
import { InvoiceDetailsSheet } from './InvoiceDetailsSheet'
import { InvoiceForm, type InvoiceFormInitial } from './InvoiceForm'
import { InvoiceStatusBadge } from './invoiceUi'

const STATE_FILTERS: InvoicePaymentState[] = ['unpaid', 'overdue', 'partially-paid', 'paid', 'cancelled']

function toInitial(inv: Invoice): InvoiceFormInitial {
  const f = <T,>(value: T | null) => ({ value, source: null })
  return {
    kind: inv.kind,
    merchant: f(inv.merchant),
    merchantAddress: f(inv.merchantAddress),
    merchantTaxId: f(inv.merchantTaxId),
    invoiceNumber: f(inv.invoiceNumber),
    issueDate: f(inv.issueDate),
    dueDate: f(inv.dueDate),
    currency: f(inv.currency),
    subtotalMinor: f(inv.subtotalMinor),
    discountMinor: f(inv.discountMinor),
    taxMinor: f(inv.taxMinor),
    totalMinor: f(inv.totalMinor),
    categoryId: inv.categoryId ?? '',
    status: inv.status,
    paymentMethod: inv.paymentMethod,
    warrantyUntil: inv.warrantyUntil ?? '',
    returnBy: inv.returnBy ?? '',
    notes: inv.notes,
  }
}

export function InvoicesPage() {
  const { invoices, transactions } = useFinance()
  const repo = useRepository()
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const today = todayIso()
  const [params, setParams] = useSearchParams()
  const [capturing, setCapturing] = useState(false)
  const [details, setDetails] = useState<Invoice | null>(null)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [toDelete, setToDelete] = useState<Invoice | null>(null)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<InvoicePaymentState | ''>('')
  const [currency, setCurrency] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')

  // Deep links: ?new=1 (Quick add) and ?open=<id> (search, transaction details).
  const openId = params.get('open')
  const isNew = params.get('new')
  useEffect(() => {
    if (!openId && !isNew) return
    // Syncing from the URL (an external input) once per deep link.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openId) setDetails(invoices.find((i) => i.id === openId) ?? null)
    if (isNew) setCapturing(true)
    const next = new URLSearchParams(params)
    next.delete('open')
    next.delete('new')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, isNew])

  // Keep the open details in sync with the latest data.
  const current = details ? (invoices.find((i) => i.id === details.id) ?? null) : null

  const update = useMutation((id: string, patch: Partial<Invoice>) => repo.update('invoices', id, patch), { success: 'invoices.updated', errorPrefix: 'toast.couldNotSave' })
  const remove = useMutation(
    async (inv: Invoice) => {
      if (inv.file) await repo.deleteInvoiceFile(inv.file.storagePath)
      await repo.remove('invoices', inv.id)
    },
    { success: 'invoices.deleted', errorPrefix: 'toast.couldNotDelete' },
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return invoices
      .map((inv) => ({ inv, status: invoicePaymentState(inv, transactions, today) }))
      .filter(({ inv, status }) => {
        if (state && status.state !== state) return false
        if (currency && inv.currency !== currency) return false
        if (categoryId && inv.categoryId !== categoryId) return false
        if (from && (!inv.issueDate || inv.issueDate < from)) return false
        if (to && (!inv.issueDate || inv.issueDate > to)) return false
        const min = minAmount ? parseSignedAmountToMinor(minAmount, inv.currency) : null
        const max = maxAmount ? parseSignedAmountToMinor(maxAmount, inv.currency) : null
        if (min?.ok && inv.totalMinor < min.value) return false
        if (max?.ok && inv.totalMinor > max.value) return false
        return !needle || [inv.merchant, inv.invoiceNumber, inv.merchantTaxId, inv.notes].some((f) => f.toLocaleLowerCase().includes(needle))
      })
      .sort((a, b) => (b.inv.issueDate ?? '').localeCompare(a.inv.issueDate ?? '') || b.inv.createdAt.localeCompare(a.inv.createdAt))
  }, [invoices, transactions, today, query, state, currency, categoryId, from, to, minAmount, maxAmount])

  const unpaidByCurrency = new Map<string, number>()
  for (const { inv, status } of rows) {
    if (status.state === 'unpaid' || status.state === 'overdue' || status.state === 'partially-paid') {
      unpaidByCurrency.set(inv.currency, addMinor(unpaidByCurrency.get(inv.currency) ?? 0, Math.max(0, inv.totalMinor - status.paidMinor)))
    }
  }
  const dueSoon = rows.filter(({ inv, status }) => inv.dueDate && status.state !== 'paid' && status.state !== 'cancelled' && daysUntil(inv.dueDate, today) <= 14)
  const taxes = taxSummary(rows.map((r) => r.inv))
  const merchants = merchantSummary(rows.map((r) => r.inv)).slice(0, 8)
  const filtered = Boolean(query || state || currency || categoryId || from || to || minAmount || maxAmount)
  const clear = () => {
    setQuery('')
    setState('')
    setCurrency('')
    setCategoryId('')
    setFrom('')
    setTo('')
    setMinAmount('')
    setMaxAmount('')
  }

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.info(t('toast.nothingToExport'))
      return
    }
    const csv = recordsToCsv(
      ['Issue date', 'Due date', 'Merchant', 'Tax ID', 'Number', 'Type', 'Currency', 'Subtotal', 'Tax', 'Total', 'Status', 'Category', 'ID'],
      rows.map(({ inv, status }) => [
        inv.issueDate ?? '',
        inv.dueDate ?? '',
        inv.merchant,
        inv.merchantTaxId,
        inv.invoiceNumber,
        inv.kind,
        inv.currency,
        inv.subtotalMinor !== null ? minorToDecimalString(inv.subtotalMinor, inv.currency) : '',
        inv.taxMinor !== null ? minorToDecimalString(inv.taxMinor, inv.currency) : '',
        minorToDecimalString(inv.totalMinor, inv.currency),
        status.state,
        inv.categoryId ? lookup.name(inv.categoryId) : '',
        inv.id,
      ]),
    )
    downloadTextFile(`spendwise-invoices-${today}.csv`, csv, 'text/csv', true)
    toast.success(t('toast.exported', { count: rows.length }))
  }

  return (
    <>
      <PageHeader
        title={t('invoices.title')}
        description={t('invoices.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={invoices.length === 0}>
              <DownloadIcon /> {t('common.exportCsv')}
            </Button>
            <Button onClick={() => setCapturing(true)}>
              <PlusIcon /> {t('invoices.upload')}
            </Button>
          </>
        }
      />

      {invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptTextIcon}
            title={t('invoices.emptyTitle')}
            description={t('invoices.emptyText')}
            action={
              <Button onClick={() => setCapturing(true)}>
                <PlusIcon /> {t('invoices.upload')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground sm:text-sm">{t('invoices.status.unpaid')}</p>
                {unpaidByCurrency.size === 0 ? (
                  <p className="text-xl font-semibold">—</p>
                ) : (
                  [...unpaidByCurrency.entries()].map(([cur, minor]) => (
                    <p key={cur} className="text-xl font-semibold">
                      <Money minor={minor} currency={cur} />
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground sm:text-sm">{t('invoices.upcomingDue')}</p>
                <p className="text-xl font-semibold">{format.number(dueSoon.length)}</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 gap-1 py-4 lg:col-span-1">
              <CardContent className="px-4">
                <p className="text-xs text-muted-foreground sm:text-sm">{t('nav.invoices')}</p>
                <p className="text-xl font-semibold">{format.number(invoices.length)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="gap-0 py-0">
            <CardContent className="grid gap-3 p-4">
              <div className="relative">
                <Label htmlFor="inv-search" className="sr-only">
                  {t('common.search')}
                </Label>
                <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="inv-search" type="search" className="ps-9" placeholder={t('invoices.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <div className="grid gap-1">
                  <Label htmlFor="inv-status" className="text-xs text-muted-foreground">
                    {t('common.status')}
                  </Label>
                  <NativeSelect id="inv-status" value={state} onChange={(e) => setState(e.target.value as InvoicePaymentState | '')}>
                    <option value="">{t('invoices.allStatuses')}</option>
                    {STATE_FILTERS.map((s) => (
                      <option key={s} value={s}>
                        {t(`invoices.status.${s}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="inv-currency" className="text-xs text-muted-foreground">
                    {t('common.currency')}
                  </Label>
                  <CurrencySelect id="inv-currency" allowAll value={currency} onChange={(e) => setCurrency(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="inv-category" className="text-xs text-muted-foreground">
                    {t('common.category')}
                  </Label>
                  <CategorySelect id="inv-category" type="expense" allowAll value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="inv-from" className="text-xs text-muted-foreground">
                    {t('common.from')}
                  </Label>
                  <Input id="inv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="inv-to" className="text-xs text-muted-foreground">
                    {t('common.to')}
                  </Label>
                  <Input id="inv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="inv-min" className="text-xs text-muted-foreground">
                    {t('transactions.minAmount')}
                  </Label>
                  <Input id="inv-min" inputMode="decimal" dir="ltr" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="inv-max" className="text-xs text-muted-foreground">
                    {t('transactions.maxAmount')}
                  </Label>
                  <Input id="inv-max" inputMode="decimal" dir="ltr" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span aria-live="polite">{t('transactions.count', { shown: rows.length, total: invoices.length })}</span>
                {filtered ? (
                  <Button variant="ghost" size="sm" onClick={clear}>
                    <XIcon /> {t('common.clearFilters')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            {rows.length === 0 ? (
              <EmptyState icon={ReceiptTextIcon} title={t('transactions.noMatchTitle')} />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="ps-4">{t('invoices.issueDate')}</TableHead>
                        <TableHead>{t('invoices.merchant')}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t('invoices.number')}</TableHead>
                        <TableHead>{t('common.status')}</TableHead>
                        <TableHead className="pe-4 text-end">{t('invoices.total')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(({ inv, status }) => (
                        <TableRow key={inv.id} className="cursor-pointer" onClick={() => setDetails(inv)}>
                          <TableCell className="ps-4 text-muted-foreground tabular">{inv.issueDate ? format.date(inv.issueDate) : '—'}</TableCell>
                          <TableCell className="max-w-64">
                            <button type="button" className="block max-w-full truncate text-start font-medium hover:underline" onClick={() => setDetails(inv)}>
                              {inv.merchant || '—'}
                            </button>
                            <span className="text-xs text-muted-foreground">{t(`invoices.kinds.${inv.kind}`)}</span>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell" dir="ltr">
                            {inv.invoiceNumber}
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge state={status.state} confirmed={status.confirmed} />
                          </TableCell>
                          <TableCell className="pe-4 text-end font-medium">
                            <Money minor={inv.totalMinor} currency={inv.currency} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="divide-y md:hidden">
                  {rows.map(({ inv, status }) => (
                    <li key={inv.id}>
                      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-start" onClick={() => setDetails(inv)}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{inv.merchant || inv.invoiceNumber || '—'}</span>
                          <span className="block text-xs text-muted-foreground">{inv.issueDate ? format.date(inv.issueDate) : '—'}</span>
                          <span className="mt-1 block">
                            <InvoiceStatusBadge state={status.state} confirmed={status.confirmed} />
                          </span>
                        </span>
                        <Money minor={inv.totalMinor} currency={inv.currency} className="text-sm font-medium" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('invoices.taxSummary')}</CardTitle>
                <CardDescription>{t('invoices.taxSummaryText')}</CardDescription>
              </CardHeader>
              <CardContent>
                {taxes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {taxes.map((tax) => (
                      <li key={`${tax.currency}-${tax.label}`} className="flex justify-between gap-3">
                        <span>
                          {tax.label} · {tax.currency} <span className="text-xs text-muted-foreground">({t('common.items', { count: tax.count })})</span>
                        </span>
                        <Money minor={tax.amountMinor} currency={tax.currency} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('invoices.merchants')}</CardTitle>
                <CardDescription>{t('invoices.merchantsText')}</CardDescription>
              </CardHeader>
              <CardContent>
                {merchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {merchants.map((m) => (
                      <li key={`${m.merchant}-${m.currency}`} className="flex justify-between gap-3">
                        <span className="truncate">
                          {m.merchant} <span className="text-xs text-muted-foreground">({t('common.items', { count: m.count })})</span>
                        </span>
                        <Money minor={m.totalMinor} currency={m.currency} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <InvoiceCaptureDialog open={capturing} onOpenChange={setCapturing} />
      <InvoiceDetailsSheet
        invoice={current}
        onOpenChange={(open) => !open && setDetails(null)}
        onEdit={(inv) => {
          setDetails(null)
          setEditing(inv)
        }}
        onDelete={(inv) => {
          setDetails(null)
          setToDelete(inv)
        }}
      />
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
            <DialogDescription>{editing?.merchant}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <InvoiceForm
              initial={toInitial(editing)}
              showSources={false}
              sha256={editing.file?.sha256}
              editingId={editing.id}
              pending={update.pending}
              submitLabel={t('common.saveChanges')}
              onSubmit={async (output) => {
                const outcome = await update.run(editing.id, output)
                if (outcome.status !== 'error') setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('invoices.deleteTitle')}
        description={<p>{t('invoices.deleteText')}</p>}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete)).status !== 'error' : true)}
      />
    </>
  )
}
