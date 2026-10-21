import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { AccountSelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFinance } from '@/data/DataProvider'
import type { RecurringBill } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { isValidIsoDate, todayIso } from '@/lib/dates'
import { advanceDueDate, isOccurrenceRecorded } from '@/lib/recurring'

/**
 * Explains exactly what "Mark as paid" does: it records one expense for the current occurrence
 * and moves the bill to its next due date. The same occurrence cannot be recorded twice.
 */
export function MarkPaidDialog({ bill, onOpenChange }: { bill: RecurringBill | null; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={bill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {bill ? <MarkPaidForm key={`${bill.id}-${bill.nextDueDate}`} bill={bill} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function MarkPaidForm({ bill, onDone }: { bill: RecurringBill; onDone(): void }) {
  const repo = useRepository()
  const { transactions, accounts } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const [paidOn, setPaidOn] = useState(todayIso())
  const defaultAccount = accounts.some((a) => a.id === bill.accountId && a.currency === bill.currency && !a.archived) ? (bill.accountId ?? '') : ''
  const [accountId, setAccountId] = useState(defaultAccount)
  const alreadyRecorded = isOccurrenceRecorded(transactions, bill.id, bill.nextDueDate)
  const next = advanceDueDate(bill.nextDueDate, bill.frequency, bill.anchorDay)
  const willEnd = bill.endDate !== null && next > bill.endDate
  const record = useMutation(
    (date: string, paidFrom: string | null) => repo.recordBillPayment(bill, date, paidFrom),
    { success: 'bills.pay.done', errorPrefix: 'toast.couldNotSave', queuesOffline: false },
  )
  const dateValid = isValidIsoDate(paidOn)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('bills.pay.title', { name: bill.name })}</DialogTitle>
        <DialogDescription>{t('bills.pay.text', { date: format.date(bill.nextDueDate) })}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-sm">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-2 font-medium">{t('bills.pay.willDo')}</p>
          <ul className="grid list-disc gap-1 ps-5 text-muted-foreground">
            <li>
              {t('bills.pay.addExpense', {
                amount: format.money(bill.amountMinor, bill.currency),
                category: lookup.name(bill.categoryId),
                date: dateValid ? format.date(paidOn) : t('common.unknown'),
              })}
            </li>
            <li>{willEnd ? t('bills.pay.end') : t('bills.pay.advance', { date: format.date(next) })}</li>
          </ul>
        </div>
        {alreadyRecorded ? (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2">
            {t('bills.pay.already')}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('bills.pay.paymentDate')} error={dateValid ? undefined : 'validation.date'}>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </FormField>
          <FormField label={t('bills.pay.paidFrom')}>
            <AccountSelect currency={bill.currency} value={accountId} onChange={(e) => setAccountId(e.target.value)} />
          </FormField>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={record.pending}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={record.pending || alreadyRecorded || !dateValid}
          onClick={async () => {
            const outcome = await record.run(paidOn, accountId || null)
            if (outcome.status !== 'error') onDone()
          }}
        >
          {record.pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {t('bills.pay.submit')}
        </Button>
      </DialogFooter>
    </>
  )
}
