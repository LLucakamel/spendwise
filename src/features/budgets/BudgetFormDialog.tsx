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
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { budgetFormSchema, type BudgetFormValues } from '@/domain/schemas'
import type { Budget, BudgetInput } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { monthOf, todayIso } from '@/lib/dates'
import { budgetsOverlap } from '@/lib/finance'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'

function BudgetForm({ budget, onDone }: { budget?: Budget; onDone(): void }) {
  const repo = useRepository()
  const { settings, categories, budgets } = useFinance()
  const { t } = useI18n()
  const [id] = useState(() => budget?.id ?? repo.newId())
  const { register, handleSubmit, formState, setError } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: budget
      ? {
          name: budget.name,
          categoryId: budget.categoryId,
          limit: minorToDecimalString(budget.limitMinor, budget.currency),
          currency: budget.currency,
          startMonth: budget.startMonth,
          endMonth: budget.endMonth ?? '',
          notes: budget.notes,
        }
      : {
          name: '',
          categoryId: categories.find((c) => c.type === 'expense')?.id ?? '',
          limit: '',
          currency: settings.displayCurrency,
          startMonth: monthOf(todayIso()),
          endMonth: '',
          notes: '',
        },
  })
  const errors = formState.errors
  const save = useMutation((input: BudgetInput) => (budget ? repo.updateBudget(id, input) : repo.createBudget(id, input)), {
    success: budget ? 'budgets.form.updated' : 'budgets.form.created',
    errorPrefix: 'toast.couldNotSave',
  })

  const onSubmit = handleSubmit(async (values) => {
    const limit = parseAmountToMinor(values.limit, values.currency)
    if (!limit.ok) return
    const input: BudgetInput = {
      name: values.name.trim(),
      categoryId: values.categoryId,
      limitMinor: limit.value,
      currency: values.currency,
      startMonth: values.startMonth,
      endMonth: values.endMonth || null,
      notes: values.notes.trim(),
    }
    const conflict = budgets.find((b) => b.id !== id && budgetsOverlap(b, input))
    if (conflict) {
      setError('categoryId', { message: t('budgets.form.overlap', { name: conflict.name, currency: input.currency }) })
      return
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label={t('common.name')} error={errors.name?.message}>
        <Input autoComplete="off" dir="auto" placeholder={t('budgets.form.namePlaceholder')} {...register('name')} />
      </FormField>
      <FormField label={t('budgets.form.category')} error={errors.categoryId?.message} hint={t('budgets.form.categoryHint')}>
        <CategorySelect type="expense" {...register('categoryId')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
        <FormField label={t('budgets.form.limit')} error={errors.limit?.message}>
          <Input inputMode="decimal" dir="ltr" autoComplete="off" placeholder="0.00" className="tabular" {...register('limit')} />
        </FormField>
        <FormField label={t('common.currency')} error={errors.currency?.message} hint={t('budgets.form.currencyHint')}>
          <CurrencySelect {...register('currency')} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('budgets.form.firstMonth')} error={errors.startMonth?.message}>
          <Input type="month" {...register('startMonth')} />
        </FormField>
        <FormField label={t('budgets.form.lastMonth')} error={errors.endMonth?.message} hint={t('budgets.form.lastMonthHint')}>
          <Input type="month" {...register('endMonth')} />
        </FormField>
      </div>
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} dir="auto" {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {budget ? t('common.saveChanges') : t('budgets.form.submitNew')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BudgetFormDialog({ open, onOpenChange, budget }: { open: boolean; onOpenChange(open: boolean): void; budget?: Budget }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{budget ? t('budgets.form.editTitle') : t('budgets.form.newTitle')}</DialogTitle>
          <DialogDescription>{t('budgets.form.text')}</DialogDescription>
        </DialogHeader>
        {open ? <BudgetForm budget={budget} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
