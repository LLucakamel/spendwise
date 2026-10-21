import { CalendarClockIcon, CheckCircle2Icon, PencilIcon, Trash2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppPath } from '@/app/session'
import { Money } from '@/components/common/Money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useFinance } from '@/data/DataProvider'
import type { Transaction } from '@/domain/types'
import { useAccountLookup, useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function TransactionDetailsSheet({
  transaction,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  transaction: Transaction | null
  onOpenChange(open: boolean): void
  onEdit(t: Transaction): void
  onDelete(t: Transaction): void
}) {
  const { t: tr } = useI18n()
  const format = useFormat()
  const categories = useCategoryLookup()
  const accounts = useAccountLookup()
  const appPath = useAppPath()
  const { recurringBills, incomeSources, invoices } = useFinance()
  const t = transaction
  const bill = t?.recurringBillId ? recurringBills.find((b) => b.id === t.recurringBillId) : undefined
  const source = t?.incomeSourceId ? incomeSources.find((s) => s.id === t.incomeSourceId) : undefined
  const invoice = t?.invoiceId ? invoices.find((i) => i.id === t.invoiceId) : undefined

  return (
    <Sheet open={t !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {t ? (
          <>
            <SheetHeader>
              <SheetTitle>{t.description}</SheetTitle>
              <SheetDescription>{tr('txDetails.title')}</SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <p className="text-3xl font-semibold">
                <Money minor={t.amountMinor} currency={t.currency} type={t.type} />
              </p>
              <dl className="mt-4 divide-y">
                <Row label={tr('txDetails.type')}>
                  <Badge variant="outline">{tr(`types.${t.type}`)}</Badge>
                </Row>
                <Row label={tr('txDetails.date')}>{format.date(t.date)}</Row>
                {t.type !== 'transfer' ? (
                  <Row label={tr('txDetails.category')}>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: categories.color(t.categoryId) }} aria-hidden="true" />
                      {categories.name(t.categoryId)}
                    </span>
                  </Row>
                ) : null}
                <Row label={tr('txDetails.account')}>{t.type === 'transfer' ? tr('txDetails.fromTo', { from: accounts.name(t.accountId), to: accounts.name(t.toAccountId) }) : accounts.name(t.accountId)}</Row>
                <Row label={tr('txDetails.currency')}>{t.currency}</Row>
                <Row label={tr('txDetails.method')}>{t.paymentMethod ? tr(`paymentMethods.${t.paymentMethod}`) : tr('common.notSpecified')}</Row>
                <Row label={tr('txDetails.origin')}>{tr(`origins.${t.origin}`)}</Row>
                {t.sourceRef ? (
                  <Row label={tr('txDetails.reference')}>
                    <span dir="auto">{t.sourceRef}</span>
                  </Row>
                ) : null}
                {t.recurringBillId ? (
                  <Row label={tr('txDetails.bill')}>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {tr('txDetails.billDue', { name: bill?.name ?? tr('txDetails.deletedBill'), date: t.recurringDueDate ? format.date(t.recurringDueDate) : '—' })}
                    </span>
                  </Row>
                ) : null}
                {t.incomeSourceId ? <Row label={tr('txDetails.incomeSource')}>{source?.name ?? '—'}</Row> : null}
                {invoice ? (
                  <Row label={tr('txDetails.invoice')}>
                    <Link to={`${appPath('/invoices')}?open=${invoice.id}`} className="font-medium text-primary hover:underline">
                      {invoice.merchant || invoice.invoiceNumber || tr('txDetails.openInvoice')}
                    </Link>
                  </Row>
                ) : null}
                {t.reconciled ? (
                  <Row label={tr('txDetails.reconciled')}>
                    <CheckCircle2Icon className="size-4 text-income" aria-label={tr('common.yes')} />
                  </Row>
                ) : null}
                <Row label={tr('txDetails.notes')}>{t.notes || <span className="text-muted-foreground">{tr('common.none')}</span>}</Row>
                <Row label={tr('txDetails.created')}>{format.timestamp(t.createdAt)}</Row>
                <Row label={tr('txDetails.modified')}>{format.timestamp(t.updatedAt)}</Row>
              </dl>
            </div>
            <SheetFooter className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(t)}>
                <PencilIcon /> {tr('common.edit')}
              </Button>
              <Button variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => onDelete(t)}>
                <Trash2Icon /> {tr('common.delete')}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
