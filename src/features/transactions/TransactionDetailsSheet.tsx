import { CalendarClockIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Money } from '@/components/common/Money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useFinance } from '@/data/DataProvider'
import { PAYMENT_METHOD_LABELS, type Transaction } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'

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
  const format = useFormat()
  const categories = useCategoryLookup()
  const { recurringBills } = useFinance()
  const t = transaction
  const bill = t?.recurringBillId ? recurringBills.find((b) => b.id === t.recurringBillId) : undefined

  return (
    <Sheet open={t !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {t ? (
          <>
            <SheetHeader>
              <SheetTitle>{t.description}</SheetTitle>
              <SheetDescription>Transaction details</SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <p className="text-3xl font-semibold">
                <Money minor={t.amountMinor} currency={t.currency} type={t.type} />
              </p>
              <dl className="mt-4 divide-y">
                <Row label="Type">
                  <Badge variant="outline" className={t.type === 'income' ? 'text-income' : 'text-expense'}>
                    {t.type === 'income' ? 'Income' : 'Expense'}
                  </Badge>
                </Row>
                <Row label="Date">{format.date(t.date)}</Row>
                <Row label="Category">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: categories.color(t.categoryId) }} aria-hidden="true" />
                    {categories.name(t.categoryId)}
                  </span>
                </Row>
                <Row label="Currency">{t.currency}</Row>
                <Row label="Payment method">{t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : 'Not specified'}</Row>
                {t.recurringBillId ? (
                  <Row label="Recurring bill">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {bill?.name ?? 'Deleted bill'} · due {t.recurringDueDate ? format.date(t.recurringDueDate) : '—'}
                    </span>
                  </Row>
                ) : null}
                <Row label="Notes">{t.notes || <span className="text-muted-foreground">None</span>}</Row>
                <Row label="Created">{format.timestamp(t.createdAt)}</Row>
                <Row label="Last modified">{format.timestamp(t.updatedAt)}</Row>
              </dl>
            </div>
            <SheetFooter className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onEdit(t)}>
                <PencilIcon /> Edit
              </Button>
              <Button variant="outline" className="flex-1 text-destructive hover:text-destructive" onClick={() => onDelete(t)}>
                <Trash2Icon /> Delete
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
