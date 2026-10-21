import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { recurringBillFormSchema, type RecurringBillFormValues } from '@/domain/schemas'
import { BILL_FREQUENCIES, BILL_FREQUENCY_LABELS, type RecurringBill, type RecurringBillInput } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { todayIso } from '@/lib/dates'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { anchorDayOf } from '@/lib/recurring'

function BillForm({ bill, onDone }: { bill?: RecurringBill; onDone(): void }) {
  const repo = useRepository()
  const { settings, categories } = useFinance()
  const [id] = useState(() => bill?.id ?? repo.newId())
  const { register, handleSubmit, formState } = useForm<RecurringBillFormValues>({
    resolver: zodResolver(recurringBillFormSchema),
    defaultValues: bill
      ? {
          name: bill.name,
          amount: minorToDecimalString(bill.amountMinor, bill.currency),
          currency: bill.currency,
          categoryId: bill.categoryId,
          frequency: bill.frequency,
          nextDueDate: bill.nextDueDate,
          endDate: bill.endDate ?? '',
          notes: bill.notes,
        }
      : {
          name: '',
          amount: '',
          currency: settings.displayCurrency,
          categoryId: categories.find((c) => c.id === 'exp-subscriptions')?.id ?? categories.find((c) => c.type === 'expense')?.id ?? '',
          frequency: 'monthly',
          nextDueDate: todayIso(),
          endDate: '',
          notes: '',
        },
  })
  const errors = formState.errors
  const save = useMutation(
    (input: RecurringBillInput) => (bill ? repo.updateRecurringBill(id, input) : repo.createRecurringBill(id, input)),
    { success: bill ? 'Bill updated' : 'Recurring bill added', errorPrefix: 'Couldn’t save the bill.' },
  )

  const onSubmit = handleSubmit(async (values) => {
    const amount = parseAmountToMinor(values.amount, values.currency)
    if (!amount.ok) return
    const endDate = values.endDate || null
    const dueChanged = !bill || bill.nextDueDate !== values.nextDueDate
    const input: RecurringBillInput = {
      name: values.name.trim(),
      amountMinor: amount.value,
      currency: values.currency,
      categoryId: values.categoryId,
      frequency: values.frequency,
      nextDueDate: values.nextDueDate,
      anchorDay: dueChanged ? anchorDayOf(values.nextDueDate) : bill.anchorDay,
      endDate,
      notes: values.notes.trim(),
      // An ended bill becomes active again if its end date is moved past the next due date.
      status: bill ? (bill.status === 'ended' && (endDate === null || endDate >= values.nextDueDate) ? 'active' : bill.status) : 'active',
      lastPaidDate: bill?.lastPaidDate ?? null,
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label="Name" error={errors.name?.message}>
        <Input autoComplete="off" placeholder="e.g. Internet" {...register('name')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
        <FormField label="Amount" error={errors.amount?.message}>
          <Input inputMode="decimal" autoComplete="off" placeholder="0.00" className="tabular" {...register('amount')} />
        </FormField>
        <FormField label="Currency" error={errors.currency?.message}>
          <CurrencySelect {...register('currency')} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Category" error={errors.categoryId?.message}>
          <CategorySelect type="expense" {...register('categoryId')} />
        </FormField>
        <FormField label="Frequency" error={errors.frequency?.message}>
          <NativeSelect {...register('frequency')}>
            {BILL_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {BILL_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Next due date" error={errors.nextDueDate?.message}>
          <Input type="date" {...register('nextDueDate')} />
        </FormField>
        <FormField label="End date (optional)" error={errors.endDate?.message} hint="No more occurrences after this date.">
          <Input type="date" {...register('endDate')} />
        </FormField>
      </div>
      <FormField label="Notes (optional)" error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {bill ? 'Save changes' : 'Add bill'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BillFormDialog({ open, onOpenChange, bill }: { open: boolean; onOpenChange(open: boolean): void; bill?: RecurringBill }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill ? 'Edit recurring bill' : 'New recurring bill'}</DialogTitle>
          <DialogDescription>Track a subscription or regular payment and see when it’s due.</DialogDescription>
        </DialogHeader>
        {open ? <BillForm bill={bill} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
