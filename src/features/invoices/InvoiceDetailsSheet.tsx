import { CheckIcon, ExternalLinkIcon, FileIcon, LinkIcon, PencilIcon, PlusIcon, Trash2Icon, UnlinkIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useRepository, useSession } from '@/app/session'
import { Money } from '@/components/common/Money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useFinance } from '@/data/DataProvider'
import type { Invoice } from '@/domain/types'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { errorKey } from '@/lib/errors'
import { invoicePaymentState, suggestInvoiceMatches } from '@/lib/invoice/invoices'
import { interpretQr } from '@/lib/invoice/structured'
import { InvoiceStatusBadge } from './invoiceUi'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function InvoiceDetailsSheet({ invoice, onOpenChange, onEdit, onDelete }: { invoice: Invoice | null; onOpenChange(open: boolean): void; onEdit(i: Invoice): void; onDelete(i: Invoice): void }) {
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const repo = useRepository()
  const { cloudFiles } = useSession()
  const { transactions, invoices } = useFinance()
  // File state belongs to one invoice; switching invoices shows nothing until the new file is opened.
  const [fileState, setFileState] = useState<{ invoiceId: string; url: string | null; missing: boolean } | null>(null)
  const ownFile = fileState && fileState.invoiceId === invoice?.id ? fileState : null
  const fileMissing = ownFile?.missing ?? false
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const today = todayIso()

  const objectUrl = fileState?.url ?? null
  useEffect(() => () => (objectUrl ? URL.revokeObjectURL(objectUrl) : undefined), [objectUrl])

  if (!invoice) return <Sheet open={false} onOpenChange={onOpenChange} />
  const state = invoicePaymentState(invoice, transactions, today)
  const linked = transactions.filter((tx) => invoice.linkedTransactionIds.includes(tx.id))
  const linkedElsewhere = new Set(invoices.filter((i) => i.id !== invoice.id).flatMap((i) => i.linkedTransactionIds))
  const suggestions = suggestInvoiceMatches(invoice, transactions, linkedElsewhere)
  const qr = invoice.qrText ? interpretQr(invoice.qrText) : null

  const openFile = async () => {
    if (!invoice.file) return
    const blob = await repo.loadInvoiceFile(invoice.file.storagePath)
    if (!blob) {
      setFileState({ invoiceId: invoice.id, url: null, missing: true })
      return
    }
    const url = URL.createObjectURL(blob)
    setFileState({ invoiceId: invoice.id, url, missing: false })
    window.open(url, '_blank', 'noopener')
  }

  const link = async (txId: string, value: boolean) => {
    setBusy(txId)
    try {
      await repo.setInvoiceLink(invoice.id, txId, value)
      toast.success(value ? t('invoices.linked') : t('invoices.unlinked'))
    } catch (e) {
      toast.error(t(errorKey(e)))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{invoice.merchant || invoice.invoiceNumber || t('invoices.title')}</SheetTitle>
            <SheetDescription>{t(`invoices.kinds.${invoice.kind}`)}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-3xl font-semibold">
                <Money minor={invoice.totalMinor} currency={invoice.currency} />
              </p>
              <InvoiceStatusBadge state={state.state} confirmed={state.confirmed} />
            </div>
            <dl className="divide-y">
              {invoice.invoiceNumber ? (
                <Row label={t('invoices.number')}>
                  <span dir="ltr">{invoice.invoiceNumber}</span>
                </Row>
              ) : null}
              {invoice.merchantTaxId ? (
                <Row label={t('invoices.taxId')}>
                  <span dir="ltr">{invoice.merchantTaxId}</span>
                </Row>
              ) : null}
              {invoice.merchantAddress ? <Row label={t('invoices.merchantAddress')}>{invoice.merchantAddress}</Row> : null}
              <Row label={t('invoices.issueDate')}>{invoice.issueDate ? format.date(invoice.issueDate) : '—'}</Row>
              {invoice.dueDate ? <Row label={t('invoices.dueDate')}>{format.date(invoice.dueDate)}</Row> : null}
              {invoice.subtotalMinor !== null ? <Row label={t('invoices.subtotal')}>{format.money(invoice.subtotalMinor, invoice.currency)}</Row> : null}
              {invoice.discountMinor ? <Row label={t('invoices.discount')}>{format.money(invoice.discountMinor, invoice.currency)}</Row> : null}
              {invoice.taxMinor !== null ? <Row label={t('invoices.tax')}>{format.money(invoice.taxMinor, invoice.currency)}</Row> : null}
              {invoice.taxLines.length > 0 ? (
                <Row label={t('invoices.taxLines')}>
                  <ul>
                    {invoice.taxLines.map((tl, i) => (
                      <li key={i}>
                        {tl.label}
                        {tl.rate ? ` ${tl.rate}%` : ''}: {format.money(tl.amountMinor, invoice.currency)}
                      </li>
                    ))}
                  </ul>
                </Row>
              ) : null}
              <Row label={t('common.category')}>{invoice.categoryId ? lookup.name(invoice.categoryId) : t('common.uncategorized')}</Row>
              {invoice.paymentMethod ? <Row label={t('txForm.paymentMethod')}>{t(`paymentMethods.${invoice.paymentMethod}`)}</Row> : null}
              {invoice.warrantyUntil ? <Row label={t('invoices.warranty')}>{format.date(invoice.warrantyUntil)}</Row> : null}
              {invoice.returnBy ? <Row label={t('invoices.returnBy')}>{format.date(invoice.returnBy)}</Row> : null}
              <Row label={t('invoices.readUsing')}>{t(`invoices.extraction.${invoice.extraction}`)}</Row>
              {invoice.notes ? <Row label={t('common.notes')}>{invoice.notes}</Row> : null}
            </dl>

            {invoice.lines.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('invoices.lines')}</h3>
                <ul className="divide-y rounded-lg border text-sm">
                  {invoice.lines.slice(0, 50).map((line, i) => (
                    <li key={i} className="flex justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0 truncate" dir="auto">
                        {line.description} {line.quantity ? `× ${line.quantity}` : ''}
                      </span>
                      <span className="tabular">{line.totalMinor !== null ? format.money(line.totalMinor, invoice.currency) : ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {qr ? (
              <section className="grid gap-1 text-sm">
                <h3 className="font-semibold">{t('invoices.qr')}</h3>
                <p className="break-all text-xs text-muted-foreground" dir="ltr">
                  {invoice.qrText.slice(0, 200)}
                </p>
                {qr.kind === 'eta-link' && qr.url ? (
                  <a href={qr.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                    <ExternalLinkIcon className="size-3.5" /> {t('invoices.openPortal')}
                  </a>
                ) : null}
                <p className="text-xs text-muted-foreground">{t('invoices.verifyNote')}</p>
              </section>
            ) : null}

            <section className="grid gap-2 text-sm">
              <h3 className="font-semibold">{t('invoices.file')}</h3>
              {invoice.file ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{invoice.file.name}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void openFile()}>
                    {t('invoices.viewFile')}
                  </Button>
                  <p className="w-full text-xs text-muted-foreground">
                    {invoice.file.storagePath.startsWith('users/') && cloudFiles ? t('invoices.fileInCloud') : t('invoices.fileOnDevice')}
                  </p>
                  {fileMissing ? <p className="w-full text-xs text-warning">{t('invoices.fileUnavailable')}</p> : null}
                </div>
              ) : (
                <p className="text-muted-foreground">{t('invoices.noFile')}</p>
              )}
            </section>

            <section className="grid gap-2 text-sm">
              <h3 className="font-semibold">{t('invoices.payments')}</h3>
              <p className="text-muted-foreground">{t('invoices.paidAmount', { paid: format.money(state.paidMinor, invoice.currency), total: format.money(invoice.totalMinor, invoice.currency) })}</p>
              {linked.length > 0 ? (
                <ul className="divide-y rounded-lg border">
                  {linked.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{tx.description}</span>
                        <span className="text-xs text-muted-foreground">{format.date(tx.date)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Money minor={tx.amountMinor} currency={tx.currency} type={tx.type} />
                        <Button variant="ghost" size="icon-sm" aria-label={t('invoices.unlink')} disabled={busy === tx.id} onClick={() => void link(tx.id, false)}>
                          <UnlinkIcon />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {state.state !== 'paid' || !state.confirmed ? (
                <div className="grid gap-2 rounded-lg border p-3">
                  <p className="font-medium">{t('invoices.suggestions')}</p>
                  <p className="text-xs text-muted-foreground">{t('invoices.suggestionsText')}</p>
                  {suggestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('invoices.noSuggestions')}</p>
                  ) : (
                    <ul className="grid gap-1">
                      {suggestions.map((s) => (
                        <li key={s.transaction.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 text-xs">
                            <span className="block truncate text-sm">{s.transaction.description}</span>
                            {format.date(s.transaction.date)} · {s.reasons.map((r) => t(`invoices.reasons.${r}`)).join('، ')}
                          </span>
                          <Button size="sm" variant="outline" disabled={busy === s.transaction.id} onClick={() => void link(s.transaction.id, true)}>
                            <LinkIcon /> {t('invoices.linkPayment')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setRecording(true)}>
                    <PlusIcon /> {t('invoices.recordPayment')}
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-1 text-income">
                  <CheckIcon className="size-4" /> {t('invoices.confirmedPaid')}
                </p>
              )}
            </section>

            {invoice.rawText ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">{t('invoices.rawText')}</summary>
                <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap" dir="auto">
                  {invoice.rawText}
                </pre>
              </details>
            ) : null}
            <p className="text-xs text-muted-foreground">
              <Badge variant="outline">{invoice.currency}</Badge> {t('txDetails.created')}: {format.timestamp(invoice.createdAt)}
            </p>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(invoice)}>
              <PencilIcon /> {t('common.edit')}
            </Button>
            <Button variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => onDelete(invoice)}>
              <Trash2Icon /> {t('common.delete')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <TransactionFormDialog
        open={recording}
        onOpenChange={setRecording}
        draft={{
          type: 'expense',
          description: (invoice.merchant || invoice.invoiceNumber).slice(0, 120),
          amountMinor: Math.max(0, invoice.totalMinor - state.paidMinor) || invoice.totalMinor,
          currency: invoice.currency,
          date: today,
          categoryId: invoice.categoryId ?? undefined,
          invoiceId: invoice.id,
        }}
        onSaved={(txId) => void repo.setInvoiceLink(invoice.id, txId, true).catch(() => undefined)}
      />
    </>
  )
}
