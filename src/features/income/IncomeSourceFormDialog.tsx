import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { AccountSelect, CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { incomeSourceFormSchema, type IncomeSourceFormValues } from '@/domain/schemas'
import { INCOME_FREQUENCIES, type IncomeSource, type IncomeSourceInput } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { anchorDayOf } from '@/lib/recurring'

function SourceForm({ source, onDone }: { source?: IncomeSource; onDone(): void }) {
  const repo = useRepository()
  const { settings, categories } = useFinance()
  const { t } = useI18n()
  const [id] = useState(() => source?.id ?? repo.newId())
  const { register, handleSubmit, formState } = useForm<IncomeSourceFormValues>({
    resolver: zodResolver(incomeSourceFormSchema),
    defaultValues: source
      ? {
          name: source.name,
          categoryId: source.categoryId,
          description: source.description,
          currency: source.currency,
          expectedAmount: minorToDecimalString(source.expectedAmountMinor, source.currency),
          frequency: source.frequency,
          nextExpectedDate: source.nextExpectedDate,
          endDate: source.endDate ?? '',
          accountId: source.accountId ?? '',
          notes: source.notes,
        }
      : {
          name: '',
          categoryId: categories.find((c) => c.id === 'inc-salary')?.id ?? categories.find((c) => c.type === 'income')?.id ?? '',
          description: '',
          currency: settings.displayCurrency,
          expectedAmount: '',
          frequency: 'monthly',
          nextExpectedDate: todayIso(),
          endDate: '',
          accountId: '',
          notes: '',
        },
  })
  const errors = formState.errors
  const save = useMutation((input: IncomeSourceInput) => (source ? repo.update('incomeSources', id, input) : repo.create('incomeSources', id, input)), {
    success: source ? 'income.sourceForm.updated' : 'income.sourceForm.created',
    errorPrefix: 'toast.couldNotSave',
  })

  const onSubmit = handleSubmit(async (values) => {
    const amount = parseAmountToMinor(values.expectedAmount, values.currency)
    if (!amount.ok) return
    const dateChanged = !source || source.nextExpectedDate !== values.nextExpectedDate
    const input: IncomeSourceInput = {
      name: values.name.trim(),
      categoryId: values.categoryId,
      description: values.description.trim(),
      currency: values.currency,
      expectedAmountMinor: amount.value,
      frequency: values.frequency,
      nextExpectedDate: values.nextExpectedDate,
      anchorDay: dateChanged ? anchorDayOf(values.nextExpectedDate) : source.anchorDay,
      endDate: values.endDate || null,
      accountId: values.accountId || null,
      status: source ? (source.status === 'completed' && dateChanged ? 'active' : source.status) : 'active',
      notes: values.notes.trim(),
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label={t('common.name')} error={errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      <FormField label={t('common.description')} error={errors.description?.message}>
        <Input autoComplete="off" placeholder={t('income.sourceForm.descriptionPlaceholder')} {...register('description')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
        <FormField label={t('income.sourceForm.expectedAmount')} error={errors.expectedAmount?.message}>
          <Input inputMode="decimal" dir="ltr" placeholder="0.00" className="tabular" {...register('expectedAmount')} />
        </FormField>
        <FormField label={t('common.currency')} error={errors.currency?.message}>
          <CurrencySelect {...register('currency')} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('common.category')} error={errors.categoryId?.message}>
          <CategorySelect type="income" {...register('categoryId')} />
        </FormField>
        <FormField label={t('income.sourceForm.frequency')} error={errors.frequency?.message}>
          <NativeSelect {...register('frequency')}>
            {INCOME_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(`frequencies.${f}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('income.sourceForm.nextDate')} error={errors.nextExpectedDate?.message}>
          <Input type="date" {...register('nextExpectedDate')} />
        </FormField>
        <FormField label={t('income.sourceForm.endDate')} error={errors.endDate?.message}>
          <Input type="date" {...register('endDate')} />
        </FormField>
      </div>
      <FormField label={t('income.sourceForm.destination')}>
        <AccountSelect {...register('accountId')} />
      </FormField>
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {source ? t('common.saveChanges') : t('common.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function IncomeSourceFormDialog({ open, onOpenChange, source }: { open: boolean; onOpenChange(open: boolean): void; source?: IncomeSource }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source ? t('income.sourceForm.editTitle') : t('income.sourceForm.newTitle')}</DialogTitle>
          <DialogDescription>{t('income.sourceForm.text')}</DialogDescription>
        </DialogHeader>
        {open ? <SourceForm source={source} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
