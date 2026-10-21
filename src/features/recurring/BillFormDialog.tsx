import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { AccountSelect, CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { recurringBillFormSchema, type RecurringBillFormValues } from '@/domain/schemas'
import { BILL_FREQUENCIES, type RecurringBill, type RecurringBillInput } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { anchorDayOf } from '@/lib/recurring'

function BillForm({ bill, onDone }: { bill?: RecurringBill; onDone(): void }) {
  const repo = useRepository()
  const { settings, categories, accounts } = useFinance()
  const { t } = useI18n()
  const [id] = useState(() => bill?.id ?? repo.newId())
  const { register, handleSubmit, formState, control } = useForm<RecurringBillFormValues>({
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
          accountId: bill.accountId ?? '',
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
          accountId: '',
          notes: '',
        },
  })
  const currency = useWatch({ control, name: 'currency' })
  const errors = formState.errors
  const save = useMutation(
    (input: RecurringBillInput) => (bill ? repo.updateRecurringBill(id, input) : repo.createRecurringBill(id, input)),
    { success: bill ? 'bills.updated' : 'bills.form.created', errorPrefix: 'toast.couldNotSave' },
  )

  const onSubmit = handleSubmit(async (values) => {
    const amount = parseAmountToMinor(values.amount, values.currency)
    if (!amount.ok) return
    const endDate = values.endDate || null
    const dueChanged = !bill || bill.nextDueDate !== values.nextDueDate
    // An account in another currency can't pay this bill (e.g. after the currency was changed).
    const accountId = accounts.some((a) => a.id === values.accountId && a.currency === values.currency) ? values.accountId : null
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
      accountId,
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label={t('common.name')} error={errors.name?.message}>
        <Input autoComplete="off" dir="auto" placeholder={t('bills.form.namePlaceholder')} {...register('name')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
        <FormField label={t('common.amount')} error={errors.amount?.message}>
          <Input inputMode="decimal" dir="ltr" autoComplete="off" placeholder="0.00" className="tabular" {...register('amount')} />
        </FormField>
        <FormField label={t('common.currency')} error={errors.currency?.message}>
          <CurrencySelect {...register('currency')} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('common.category')} error={errors.categoryId?.message}>
          <CategorySelect type="expense" {...register('categoryId')} />
        </FormField>
        <FormField label={t('bills.form.frequency')} error={errors.frequency?.message}>
          <NativeSelect {...register('frequency')}>
            {BILL_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(`frequencies.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('bills.form.nextDue')} error={errors.nextDueDate?.message}>
          <Input type="date" {...register('nextDueDate')} />
        </FormField>
        <FormField label={t('bills.form.endDate')} error={errors.endDate?.message} hint={t('bills.form.endDateHint')}>
          <Input type="date" {...register('endDate')} />
        </FormField>
      </div>
      <FormField label={t('bills.form.account')} error={errors.accountId?.message}>
        <AccountSelect currency={currency} {...register('accountId')} />
      </FormField>
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} dir="auto" {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {bill ? t('common.saveChanges') : t('bills.form.submitNew')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BillFormDialog({ open, onOpenChange, bill }: { open: boolean; onOpenChange(open: boolean): void; bill?: RecurringBill }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill ? t('bills.form.editTitle') : t('bills.form.newTitle')}</DialogTitle>
          <DialogDescription>{t('bills.form.text')}</DialogDescription>
        </DialogHeader>
        {open ? <BillForm bill={bill} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
