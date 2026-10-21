import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { Money } from '@/components/common/Money'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFinance } from '@/data/DataProvider'
import type { RecurringBill } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { isValidIsoDate, todayIso } from '@/lib/dates'
import { advanceDueDate, isOccurrenceRecorded } from '@/lib/recurring'

/**
 * Explains exactly what "Mark as paid" does: it records one expense for the current occurrence
 * and moves the bill to its next due date. The same occurrence cannot be recorded twice.
 */
export function MarkPaidDialog({ bill, onOpenChange }: { bill: RecurringBill | null; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={bill !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {bill ? <MarkPaidForm key={`${bill.id}-${bill.nextDueDate}`} bill={bill} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function MarkPaidForm({ bill, onDone }: { bill: RecurringBill; onDone(): void }) {
  const repo = useRepository()
  const { transactions } = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const [paidOn, setPaidOn] = useState(todayIso())
  const alreadyRecorded = isOccurrenceRecorded(transactions, bill.id, bill.nextDueDate)
  const next = advanceDueDate(bill.nextDueDate, bill.frequency, bill.anchorDay)
  const willEnd = bill.endDate !== null && next > bill.endDate
  const record = useMutation((date: string) => repo.recordBillPayment(bill, date), {
    success: 'Payment recorded as an expense',
    errorPrefix: 'Couldn’t record the payment.',
    queuesOffline: false,
  })
  const dateValid = isValidIsoDate(paidOn)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark “{bill.name}” as paid</DialogTitle>
        <DialogDescription>For the occurrence due {format.date(bill.nextDueDate)}.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-sm">
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-2 font-medium">This will:</p>
          <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
            <li>
              Add an expense of <Money minor={bill.amountMinor} currency={bill.currency} className="font-medium text-foreground" /> in{' '}
              {lookup.name(bill.categoryId)}, dated {dateValid ? format.date(paidOn) : '—'}.
            </li>
            <li>{willEnd ? 'End this bill, because the next occurrence is after its end date.' : `Move the next due date to ${format.date(next)}.`}</li>
          </ul>
        </div>
        {alreadyRecorded ? (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2">
            A payment for this occurrence is already recorded, so another one can’t be added.
          </p>
        ) : null}
        <FormField label="Payment date" error={dateValid ? undefined : 'Enter a valid date.'}>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </FormField>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={record.pending}>
          Cancel
        </Button>
        <Button
          disabled={record.pending || alreadyRecorded || !dateValid}
          onClick={async () => {
            const outcome = await record.run(paidOn)
            if (outcome.status !== 'error') onDone()
          }}
        >
          {record.pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          Record payment
        </Button>
      </DialogFooter>
    </>
  )
}
