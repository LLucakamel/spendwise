import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, SparklesIcon } from 'lucide-react'
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
import { TRANSACTION_DEFAULTS } from '@/data/repository'
import { useFinance } from '@/data/DataProvider'
import { transactionFormSchema, type TransactionFormValues } from '@/domain/schemas'
import { PAYMENT_METHODS, TRANSACTION_TYPES, TRANSFER_CATEGORY_ID, type Transaction, type TransactionInput, type TransactionType } from '@/domain/types'
import { useCategoryLookup } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { errorKey as amountErrorKey, minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { suggestCategory } from '@/lib/tools'
import { cn } from '@/lib/utils'

const TYPE_TONE: Record<TransactionType, string> = {
  expense: 'text-expense',
  income: 'text-income',
  refund: 'text-income',
  transfer: 'text-foreground',
}

function toFormValues(t: Transaction): TransactionFormValues {
  return {
    type: t.type,
    description: t.description,
    amount: minorToDecimalString(t.amountMinor, t.currency),
    currency: t.currency,
    categoryId: t.type === 'transfer' ? '' : t.categoryId,
    date: t.date,
    notes: t.notes,
    paymentMethod: t.paymentMethod ?? 'none',
    accountId: t.accountId ?? '',
    toAccountId: t.toAccountId ?? '',
    sourceRef: t.sourceRef ?? '',
  }
}

function TypeToggle({ value, onChange, disabled }: { value: TransactionType; onChange(t: TransactionType): void; disabled?: boolean }) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('txForm.typeLabel')} className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
      {TRANSACTION_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          disabled={disabled}
          onClick={() => onChange(type)}
          className={cn(
            'rounded-md px-1 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 sm:text-sm',
            value === type ? cn('bg-background shadow-xs', TYPE_TONE[type]) : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`types.${type}`)}
        </button>
      ))}
    </div>
  )
}

export interface TransactionDraft {
  type?: TransactionType
  description?: string
  amountMinor?: number
  currency?: string
  date?: string
  categoryId?: string
  accountId?: string | null
  invoiceId?: string | null
}

function TransactionForm({ transaction, draft, onDone, onSaved }: { transaction?: Transaction; draft?: TransactionDraft; onDone(): void; onSaved?(id: string): void }) {
  const repo = useRepository()
  const { settings, categories, accounts, transactions } = useFinance()
  const lookup = useCategoryLookup()
  const { t } = useI18n()
  // The ID is fixed for the lifetime of this form, so a retried submit can never create a second record.
  const [id] = useState(() => transaction?.id ?? repo.newId())
  const firstCategory = (type: TransactionType) => {
    const kind = type === 'income' ? 'income' : 'expense'
    return categories.find((c) => c.type === kind)?.id ?? ''
  }
  const initialType = draft?.type ?? 'expense'
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: transaction
      ? toFormValues(transaction)
      : {
          type: initialType,
          description: draft?.description ?? '',
          amount: draft?.amountMinor && draft.currency ? minorToDecimalString(draft.amountMinor, draft.currency) : '',
          currency: draft?.currency ?? settings.displayCurrency,
          categoryId: initialType === 'transfer' ? '' : (draft?.categoryId ?? firstCategory(initialType)),
          date: draft?.date ?? todayIso(),
          notes: '',
          paymentMethod: 'none',
          accountId: draft?.accountId ?? '',
          toAccountId: '',
          sourceRef: '',
        },
  })
  const { register, handleSubmit, setValue, formState, control, setError } = form
  const type = useWatch({ control, name: 'type' })
  const currency = useWatch({ control, name: 'currency' })
  const description = useWatch({ control, name: 'description' })
  const categoryId = useWatch({ control, name: 'categoryId' })
  const errors = formState.errors
  const linkedBill = Boolean(transaction?.recurringBillId)
  const linkedIncome = Boolean(transaction?.incomeSourceId)
  const suggestion =
    !transaction && type !== 'transfer' && type !== 'refund' && description.trim().length >= 3 ? suggestCategory(description, type === 'income' ? 'income' : 'expense', transactions) : null

  const save = useMutation((input: TransactionInput) => (transaction ? repo.updateTransaction(id, input) : repo.createTransaction(id, input)), {
    success: transaction ? 'transactions.updated' : 'transactions.created',
    errorPrefix: 'toast.couldNotSave',
  })

  const onSubmit = handleSubmit(async (values) => {
    const amount = parseAmountToMinor(values.amount, values.currency)
    if (!amount.ok) return
    if (values.type === 'transfer') {
      const from = accounts.find((a) => a.id === values.accountId)
      const to = accounts.find((a) => a.id === values.toAccountId)
      if (from && to && (from.currency !== values.currency || to.currency !== values.currency)) {
        setError('toAccountId', { message: amountErrorKey('validation.currencyMismatch', { currency: values.currency }) })
        return
      }
    }
    const input: TransactionInput = {
      ...TRANSACTION_DEFAULTS,
      ...(transaction
        ? {
            origin: transaction.origin,
            importId: transaction.importId,
            recurringBillId: transaction.recurringBillId,
            recurringDueDate: transaction.recurringDueDate,
            incomeSourceId: transaction.incomeSourceId,
            incomeDueDate: transaction.incomeDueDate,
            invoiceId: transaction.invoiceId,
            reconciled: transaction.reconciled,
          }
        : { invoiceId: draft?.invoiceId ?? null, origin: draft?.invoiceId ? ('invoice' as const) : ('manual' as const) }),
      type: values.type,
      description: values.description.trim(),
      amountMinor: amount.value,
      currency: values.currency,
      categoryId: values.type === 'transfer' ? TRANSFER_CATEGORY_ID : values.categoryId,
      date: values.date,
      notes: values.notes.trim(),
      paymentMethod: values.paymentMethod === 'none' ? null : values.paymentMethod,
      accountId: values.accountId || null,
      toAccountId: values.type === 'transfer' ? values.toAccountId || null : null,
      sourceRef: values.sourceRef.trim() || null,
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') {
      onSaved?.(id)
      onDone()
    }
  })

  const changeType = (next: TransactionType) => {
    setValue('type', next)
    if (next === 'transfer') {
      setValue('categoryId', '')
      return
    }
    const kind = next === 'income' ? 'income' : 'expense'
    const current = categories.find((c) => c.id === form.getValues('categoryId'))
    if (!current || current.type !== kind) setValue('categoryId', firstCategory(next), { shouldValidate: formState.isSubmitted })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TypeToggle value={type} onChange={changeType} disabled={linkedBill || linkedIncome} />
      <p className="-mt-2 text-xs text-muted-foreground">{t(`typeHelp.${type}`)}</p>
      {linkedBill ? <p className="text-xs text-muted-foreground">{t('txForm.linkedBill')}</p> : null}
      {linkedIncome ? <p className="text-xs text-muted-foreground">{t('txForm.linkedIncome')}</p> : null}
      <FormField label={t('common.description')} error={errors.description?.message}>
        <Input autoComplete="off" placeholder={t('txForm.descriptionPlaceholder')} {...register('description')} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.3fr]">
        <FormField label={t('common.amount')} error={errors.amount?.message}>
          <Input inputMode="decimal" autoComplete="off" placeholder="0.00" className="tabular" dir="ltr" {...register('amount')} />
        </FormField>
        <FormField label={t('common.currency')} error={errors.currency?.message}>
          <CurrencySelect {...register('currency')} />
        </FormField>
      </div>
      {type === 'transfer' ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('txForm.fromAccount')} error={errors.accountId?.message}>
              <AccountSelect allowNone currency={currency} {...register('accountId')} />
            </FormField>
            <FormField label={t('txForm.toAccount')} error={errors.toAccountId?.message}>
              <AccountSelect allowNone currency={currency} {...register('toAccountId')} />
            </FormField>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t('txForm.transferNote')}</p>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('common.category')} error={errors.categoryId?.message}>
            <CategorySelect type={type === 'income' ? 'income' : 'expense'} placeholder={categoryId ? undefined : t('validation.categoryRequired')} {...register('categoryId')} />
          </FormField>
          <FormField label={t('txForm.accountFor')} error={errors.accountId?.message}>
            <AccountSelect allowNone {...register('accountId')} />
          </FormField>
        </div>
      )}
      {suggestion && suggestion !== categoryId ? (
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SparklesIcon className="size-3.5" aria-hidden="true" />
          {t('txForm.suggestion', { category: lookup.name(suggestion) })}
          <Button type="button" variant="outline" size="xs" onClick={() => setValue('categoryId', suggestion)}>
            {t('txForm.useSuggestion')}
          </Button>
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('common.date')} error={errors.date?.message}>
          <Input type="date" {...register('date')} />
        </FormField>
        <FormField label={t('txForm.paymentMethod')} error={errors.paymentMethod?.message}>
          <NativeSelect {...register('paymentMethod')}>
            <option value="none">{t('paymentMethods.none')}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`paymentMethods.${m}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField label={t('txForm.reference')} error={errors.sourceRef?.message} hint={t('txForm.referenceHint')}>
        <Input autoComplete="off" dir="auto" {...register('sourceRef')} />
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
          {transaction ? t('common.saveChanges') : t('txForm.submitNew')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  draft,
  onSaved,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  transaction?: Transaction
  draft?: TransactionDraft
  onSaved?(id: string): void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transaction ? t('txForm.editTitle') : t('txForm.newTitle')}</DialogTitle>
          <DialogDescription>{transaction ? t('txForm.editText') : t('txForm.newText')}</DialogDescription>
        </DialogHeader>
        {open ? <TransactionForm transaction={transaction} draft={draft} onDone={() => onOpenChange(false)} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  )
}
