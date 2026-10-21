import { ReceiptIcon } from 'lucide-react'
import { EmptyState } from '@/components/common/states'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFinance } from '@/data/DataProvider'
import type { RecurringBill } from '@/domain/types'
import { useAccountLookup, useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'

/** Expenses actually recorded for a bill (via "Mark paid"), newest first. */
export function PaymentHistoryDialog({ bill, onOpenChange }: { bill: RecurringBill | null; onOpenChange(open: boolean): void }) {
  const { transactions } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const accounts = useAccountLookup()
  const payments = bill
    ? transactions
        .filter((p) => p.recurringBillId === bill.id)
        .sort((a, b) => (b.recurringDueDate ?? b.date).localeCompare(a.recurringDueDate ?? a.date))
    : []

  return (
    <Dialog open={bill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill ? t('bills.historyTitle', { name: bill.name }) : t('bills.history')}</DialogTitle>
          <DialogDescription>{t('bills.historyText')}</DialogDescription>
        </DialogHeader>
        {payments.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title={t('bills.noPayments')} />
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{t('bills.paidOn', { date: format.date(p.date) })}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('bills.forDue', { date: p.recurringDueDate ? format.date(p.recurringDueDate) : t('common.unknown') })}
                    {p.accountId ? ` · ${accounts.name(p.accountId)}` : ''}
                  </span>
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
