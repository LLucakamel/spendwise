import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { transactionFormSchema, type TransactionFormValues } from '@/domain/schemas'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { todayIso } from '@/lib/dates'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { cn } from '@/lib/utils'

function toFormValues(t: Transaction): TransactionFormValues {
  return {
    type: t.type,
    description: t.description,
    amount: minorToDecimalString(t.amountMinor, t.currency),
    currency: t.currency,
    categoryId: t.categoryId,
    date: t.date,
    notes: t.notes,
    paymentMethod: t.paymentMethod ?? 'none',
  }
}

function TypeToggle({ value, onChange, disabled }: { value: TransactionType; onChange(t: TransactionType): void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {(['expense', 'income'] as const).map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          disabled={disabled}
          onClick={() => onChange(type)}
          className={cn(
            'rounded-md py-1.5 text-sm font-medium capitalize transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60',
            value === type
              ? type === 'income'
                ? 'bg-background text-income shadow-xs'
                : 'bg-background text-expense shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {type}
        </button>
      ))}
    </div>
  )
}

function TransactionForm({
  transaction,
  defaultType,
  onDone,
}: {
  transaction?: Transaction
  defaultType: TransactionType
  onDone(): void
}) {
  const repo = useRepository()
  const { settings, categories } = useFinance()
  // The ID is fixed for the lifetime of this form, so a retried submit can never create a second record.
  const [id] = useState(() => transaction?.id ?? repo.newId())
  const firstCategory = (type: TransactionType) => categories.find((c) => c.type === type)?.id ?? ''

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: transaction
      ? toFormValues(transaction)
      : {
          type: defaultType,
          description: '',
          amount: '',
          currency: settings.displayCurrency,
          categoryId: firstCategory(defaultType),
          date: todayIso(),
          notes: '',
          paymentMethod: 'none',
        },
  })
  const { register, handleSubmit, setValue, formState } = form
  const type = useWatch({ control: form.control, name: 'type' })
  const errors = formState.errors

  const save = useMutation(
    (input: TransactionInput) => (transaction ? repo.updateTransaction(id, input) : repo.createTransaction(id, input)),
    { success: transaction ? 'Transaction updated' : 'Transaction added', errorPrefix: 'Couldn’t save the transaction.' },
  )

  const onSubmit = handleSubmit(async (values) => {
    const amount = parseAmountToMinor(values.amount, values.currency)
    if (!amount.ok) return
    const outcome = await save.run({
      type: values.type,
      description: values.description.trim(),
      amountMinor: amount.value,
      currency: values.currency,
      categoryId: values.categoryId,
      date: values.date,
      notes: values.notes.trim(),
      paymentMethod: values.paymentMethod === 'none' ? null : values.paymentMethod,
      recurringBillId: transaction?.recurringBillId ?? null,
      recurringDueDate: transaction?.recurringDueDate ?? null,
    })
    if (outcome.status !== 'error') onDone()
  })

  const changeType = (next: TransactionType) => {
    setValue('type', next)
    const current = categories.find((c) => c.id === form.getValues('categoryId'))
    if (!current || current.type !== next) setValue('categoryId', firstCategory(next), { shouldValidate: formState.isSubmitted })
  }

  const linkedToBill = Boolean(transaction?.recurringBillId)

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TypeToggle value={type} onChange={changeType} disabled={linkedToBill} />
      {linkedToBill ? (
        <p className="text-xs text-muted-foreground">This expense was recorded from a recurring bill.</p>
      ) : null}
      <FormField label="Description" error={errors.description?.message}>
        <Input autoComplete="off" placeholder="e.g. Weekly groceries" {...register('description')} />
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
          <CategorySelect type={type} placeholder={categories.some((c) => c.type === type) ? undefined : 'No categories yet'} {...register('categoryId')} />
        </FormField>
        <FormField label="Date" error={errors.date?.message}>
          <Input type="date" {...register('date')} />
        </FormField>
      </div>
      <FormField label="Payment method (optional)" error={errors.paymentMethod?.message}>
        <NativeSelect {...register('paymentMethod')}>
          <option value="none">Not specified</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Notes (optional)" error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {transaction ? 'Save changes' : 'Add transaction'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  defaultType = 'expense',
}: {
  open: boolean
  onOpenChange(open: boolean): void
  transaction?: Transaction
  defaultType?: TransactionType
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transaction ? 'Edit transaction' : 'New transaction'}</DialogTitle>
          <DialogDescription>
            {transaction ? 'Update the details of this transaction.' : 'Record money coming in or going out.'}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TransactionForm transaction={transaction} defaultType={defaultType} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
