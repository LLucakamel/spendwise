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
import { monthOf, todayIso } from '@/lib/dates'
import { budgetsOverlap } from '@/lib/finance'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'

function BudgetForm({ budget, onDone }: { budget?: Budget; onDone(): void }) {
  const repo = useRepository()
  const { settings, categories, budgets } = useFinance()
  const [id] = useState(() => budget?.id ?? repo.newId())
  const form = useForm<BudgetFormValues>({
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
  const { register, handleSubmit, formState, setError } = form
  const errors = formState.errors
  const save = useMutation(
    (input: BudgetInput) => (budget ? repo.updateBudget(id, input) : repo.createBudget(id, input)),
    { success: budget ? 'Budget updated' : 'Budget created', errorPrefix: 'Couldn’t save the budget.' },
  )

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
      setError('categoryId', {
        message: `“${conflict.name}” already budgets this category in ${input.currency} for an overlapping period. Edit that budget or change the months, so expenses aren’t counted twice.`,
      })
      return
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label="Name" error={errors.name?.message}>
        <Input autoComplete="off" placeholder="e.g. Groceries" {...register('name')} />
      </FormField>
      <FormField label="Expense category" error={errors.categoryId?.message} hint="Only expenses in this category count toward the budget.">
        <CategorySelect type="expense" {...register('categoryId')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
        <FormField label="Monthly limit" error={errors.limit?.message}>
          <Input inputMode="decimal" autoComplete="off" placeholder="0.00" className="tabular" {...register('limit')} />
        </FormField>
        <FormField label="Currency" error={errors.currency?.message} hint="Only expenses in this currency are counted.">
          <CurrencySelect {...register('currency')} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="First month" error={errors.startMonth?.message}>
          <Input type="month" {...register('startMonth')} />
        </FormField>
        <FormField label="Last month (optional)" error={errors.endMonth?.message} hint="Leave empty for an ongoing budget.">
          <Input type="month" {...register('endMonth')} />
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
          {budget ? 'Save changes' : 'Create budget'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BudgetFormDialog({ open, onOpenChange, budget }: { open: boolean; onOpenChange(open: boolean): void; budget?: Budget }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{budget ? 'Edit budget' : 'New monthly budget'}</DialogTitle>
          <DialogDescription>Set a spending limit that applies to each month in the chosen range.</DialogDescription>
        </DialogHeader>
        {open ? <BudgetForm budget={budget} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
