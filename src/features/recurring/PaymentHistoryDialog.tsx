import { ReceiptIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/states'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFinance } from '@/data/DataProvider'
import type { RecurringBill } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'

/** Expenses actually recorded for a bill (via "Mark paid"), newest first. */
export function PaymentHistoryDialog({ bill, onOpenChange }: { bill: RecurringBill | null; onOpenChange(open: boolean): void }) {
  const { transactions } = useFinance()
  const format = useFormat()
  const payments = bill
    ? transactions
        .filter((t) => t.recurringBillId === bill.id)
        .sort((a, b) => (b.recurringDueDate ?? b.date).localeCompare(a.recurringDueDate ?? a.date))
    : []

  return (
    <Dialog open={bill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment history{bill ? ` — ${bill.name}` : ''}</DialogTitle>
          <DialogDescription>Expenses recorded with “Mark paid”. Scheduled occurrences that weren’t paid are not listed.</DialogDescription>
        </DialogHeader>
        {payments.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title="No payments recorded yet" />
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="block font-medium">Paid {format.date(p.date)}</span>
                  <span className="block text-xs text-muted-foreground">For the occurrence due {p.recurringDueDate ? format.date(p.recurringDueDate) : '—'}</span>
                </span>
                <span className="tabular">{format.money(p.amountMinor, p.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
