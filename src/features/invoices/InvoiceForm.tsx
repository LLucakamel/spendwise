import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/common/FormField'
import { CategorySelect, CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { isSupportedCurrency } from '@/domain/currencies'
import { INVOICE_KINDS, INVOICE_STATUSES, PAYMENT_METHODS, type InvoiceInput, type InvoiceKind, type InvoiceStatus, type PaymentMethod } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { isValidIsoDate } from '@/lib/dates'
import { findDuplicateInvoices } from '@/lib/invoice/invoices'
import { checkArithmetic } from '@/lib/invoice/extract'
import { minorToDecimalString, parseSignedAmountToMinor } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ReviewField } from './readDocument'

const optionalDate = z.union([z.literal(''), z.string().refine(isValidIsoDate, 'validation.date')])
const optionalAmount = z.string()

const invoiceFormSchema = z
  .object({
    kind: z.enum(INVOICE_KINDS),
    merchant: z.string().trim().max(120, 'validation.tooLong'),
    merchantAddress: z.string().max(200, 'validation.tooLong'),
    merchantTaxId: z.string().trim().max(40, 'validation.tooLong'),
    invoiceNumber: z.string().trim().max(60, 'validation.tooLong'),
    issueDate: optionalDate,
    dueDate: optionalDate,
    currency: z.string().refine(isSupportedCurrency, 'validation.currency'),
    subtotal: optionalAmount,
    discount: optionalAmount,
    tax: optionalAmount,
    total: z.string(),
    categoryId: z.string(),
    status: z.enum(INVOICE_STATUSES),
    paymentMethod: z.enum([...PAYMENT_METHODS, 'none']),
    warrantyUntil: optionalDate,
    returnBy: optionalDate,
    notes: z.string().max(1000, 'validation.notesLength'),
  })
  .superRefine((v, ctx) => {
    if (!isSupportedCurrency(v.currency)) return
    for (const key of ['subtotal', 'discount', 'tax'] as const) {
      if (!v[key].trim()) continue
      const r = parseSignedAmountToMinor(v[key], v.currency)
      if (!r.ok || r.value < 0) ctx.addIssue({ code: 'custom', path: [key], message: r.ok ? 'validation.amountPositive' : r.error })
    }
    const total = parseSignedAmountToMinor(v.total, v.currency)
    if (!v.total.trim()) ctx.addIssue({ code: 'custom', path: ['total'], message: 'validation.amountRequired' })
    else if (!total.ok || total.value < 0) ctx.addIssue({ code: 'custom', path: ['total'], message: total.ok ? 'validation.amountPositive' : total.error })
  })

export type InvoiceFormValues = z.input<typeof invoiceFormSchema>

export interface InvoiceFormInitial {
  kind: InvoiceKind
  merchant: ReviewField<string>
  merchantAddress: ReviewField<string>
  merchantTaxId: ReviewField<string>
  invoiceNumber: ReviewField<string>
  issueDate: ReviewField<string>
  dueDate: ReviewField<string>
  currency: ReviewField<string>
  subtotalMinor: ReviewField<number>
  discountMinor: ReviewField<number>
  taxMinor: ReviewField<number>
  totalMinor: ReviewField<number>
  categoryId: string
  status: InvoiceStatus
  paymentMethod: PaymentMethod | null
  warrantyUntil: string
  returnBy: string
  notes: string
}

export type InvoiceFormOutput = Omit<InvoiceInput, 'taxLines' | 'lines' | 'qrText' | 'extraction' | 'rawText' | 'linkedTransactionIds' | 'file'>

/** Review/edit form. When `showSources` is on, every field shows what it was read from or "not found". */
export function InvoiceForm({
  initial,
  showSources,
  sha256,
  editingId,
  pending,
  submitLabel,
  secondaryLabel,
  onSubmit,
  onCancel,
}: {
  initial: InvoiceFormInitial
  showSources: boolean
  sha256?: string | null
  editingId?: string
  pending: boolean
  submitLabel: string
  secondaryLabel?: string
  onSubmit(output: InvoiceFormOutput, secondary: boolean): void
  onCancel(): void
}) {
  const { t, tx } = useI18n()
  const { invoices, settings } = useFinance()
  const format = useFormat()
  const currency0 = initial.currency.value ?? settings.displayCurrency
  const amount = (f: ReviewField<number>) => (f.value === null ? '' : minorToDecimalString(f.value, currency0))
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      kind: initial.kind,
      merchant: initial.merchant.value ?? '',
      merchantAddress: initial.merchantAddress.value ?? '',
      merchantTaxId: initial.merchantTaxId.value ?? '',
      invoiceNumber: initial.invoiceNumber.value ?? '',
      issueDate: initial.issueDate.value ?? '',
      dueDate: initial.dueDate.value ?? '',
      currency: currency0,
      subtotal: amount(initial.subtotalMinor),
      discount: amount(initial.discountMinor),
      tax: amount(initial.taxMinor),
      total: amount(initial.totalMinor),
      categoryId: initial.categoryId,
      status: initial.status,
      paymentMethod: initial.paymentMethod ?? 'none',
      warrantyUntil: initial.warrantyUntil,
      returnBy: initial.returnBy,
      notes: initial.notes,
    },
  })
  const { register, handleSubmit, formState, control } = form
  const errors = formState.errors
  const values = useWatch({ control })
  const cur = values.currency && isSupportedCurrency(values.currency) ? values.currency : currency0
  const toMinor = (s: string | undefined) => {
    if (!s?.trim()) return null
    const r = parseSignedAmountToMinor(s, cur)
    return r.ok ? r.value : null
  }
  const subtotal = toMinor(values.subtotal)
  const discount = toMinor(values.discount)
  const tax = toMinor(values.tax)
  const total = toMinor(values.total)
  const discrepancies = checkArithmetic(subtotal, discount, tax, total)
  const duplicates = findDuplicateInvoices(
    {
      id: editingId,
      sha256: sha256 ?? null,
      merchant: values.merchant ?? '',
      merchantTaxId: values.merchantTaxId ?? '',
      invoiceNumber: values.invoiceNumber ?? '',
      issueDate: values.issueDate || null,
      totalMinor: total ?? -1,
      currency: cur,
    },
    invoices,
  )

  const sourceHint = (f: ReviewField<unknown>) =>
    showSources ? (
      f.source ? (
        <span dir="auto" className="line-clamp-1">
          {t('capture.readFrom', { line: f.source.slice(0, 80) })}
        </span>
      ) : (
        <span className="font-medium text-warning">{t('capture.notFound')}</span>
      )
    ) : undefined

  const submit = (secondary: boolean) =>
    handleSubmit((v) => {
      const toM = (s: string) => (s.trim() ? (parseSignedAmountToMinor(s, v.currency) as { ok: true; value: number }).value : null)
      onSubmit(
        {
          kind: v.kind,
          merchant: v.merchant.trim(),
          merchantAddress: v.merchantAddress.trim(),
          merchantTaxId: v.merchantTaxId.trim(),
          invoiceNumber: v.invoiceNumber.trim(),
          issueDate: v.issueDate || null,
          dueDate: v.dueDate || null,
          currency: v.currency,
          subtotalMinor: toM(v.subtotal),
          discountMinor: toM(v.discount),
          taxMinor: toM(v.tax),
          totalMinor: toM(v.total) ?? 0,
          categoryId: v.categoryId || null,
          status: v.status,
          paymentMethod: v.paymentMethod === 'none' ? null : v.paymentMethod,
          warrantyUntil: v.warrantyUntil || null,
          returnBy: v.returnBy || null,
          notes: v.notes.trim(),
        },
        secondary,
      )
    })

  return (
    <form onSubmit={submit(false)} noValidate className="grid gap-4">
      {duplicates.length > 0 ? (
        <div role="alert" className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium">{t('invoices.duplicateWarning')}</p>
            <ul className="text-xs">
              {duplicates.slice(0, 3).map((d) => (
                <li key={d.invoice.id}>
                  {t(`invoices.dupReasons.${d.reason}`)}: {d.invoice.merchant || d.invoice.invoiceNumber} · {format.money(d.invoice.totalMinor, d.invoice.currency)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {discrepancies.length > 0 ? (
        <p role="alert" className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {t('capture.discrepancy')}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('invoices.merchant')} error={errors.merchant?.message} hint={sourceHint(initial.merchant)}>
          <Input dir="auto" autoComplete="off" {...register('merchant')} />
        </FormField>
        <FormField label={t('invoices.kind')}>
          <NativeSelect {...register('kind')}>
            {INVOICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`invoices.kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('invoices.taxId')} error={errors.merchantTaxId?.message} hint={sourceHint(initial.merchantTaxId)}>
          <Input dir="ltr" autoComplete="off" {...register('merchantTaxId')} />
        </FormField>
        <FormField label={t('invoices.number')} error={errors.invoiceNumber?.message} hint={sourceHint(initial.invoiceNumber)}>
          <Input dir="ltr" autoComplete="off" {...register('invoiceNumber')} />
        </FormField>
        <FormField label={t('invoices.issueDate')} error={errors.issueDate?.message} hint={sourceHint(initial.issueDate)}>
          <Input type="date" {...register('issueDate')} />
        </FormField>
        <FormField label={t('invoices.dueDate')} error={errors.dueDate?.message} hint={sourceHint(initial.dueDate)}>
          <Input type="date" {...register('dueDate')} />
        </FormField>
      </div>
      <FormField label={t('invoices.merchantAddress')} error={errors.merchantAddress?.message}>
        <Input dir="auto" autoComplete="off" {...register('merchantAddress')} />
      </FormField>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label={t('common.currency')} error={errors.currency?.message} hint={sourceHint(initial.currency)} className="col-span-2 sm:col-span-1">
          <CurrencySelect {...register('currency')} />
        </FormField>
        <FormField label={t('invoices.subtotal')} error={errors.subtotal?.message} hint={sourceHint(initial.subtotalMinor)}>
          <Input inputMode="decimal" dir="ltr" className="tabular" {...register('subtotal')} />
        </FormField>
        <FormField label={t('invoices.discount')} error={errors.discount?.message} hint={sourceHint(initial.discountMinor)}>
          <Input inputMode="decimal" dir="ltr" className="tabular" {...register('discount')} />
        </FormField>
        <FormField label={t('invoices.tax')} error={errors.tax?.message} hint={sourceHint(initial.taxMinor)}>
          <Input inputMode="decimal" dir="ltr" className="tabular" {...register('tax')} />
        </FormField>
        <FormField label={t('invoices.total')} error={errors.total?.message} hint={sourceHint(initial.totalMinor)}>
          <Input inputMode="decimal" dir="ltr" className={cn('tabular font-semibold')} {...register('total')} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label={t('common.category')}>
          <CategorySelect type="expense" placeholder={t('common.uncategorized')} {...register('categoryId')} />
        </FormField>
        <FormField label={t('common.status')}>
          <NativeSelect {...register('status')}>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`invoices.status.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('txForm.paymentMethod')}>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('invoices.warranty')} error={errors.warrantyUntil?.message}>
          <Input type="date" {...register('warrantyUntil')} />
        </FormField>
        <FormField label={t('invoices.returnBy')} error={errors.returnBy?.message}>
          <Input type="date" {...register('returnBy')} />
        </FormField>
      </div>
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      {Object.keys(errors).length > 0 ? <p className="sr-only">{tx(Object.values(errors)[0]?.message)}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t('common.cancel')}
        </Button>
        {secondaryLabel ? (
          <Button type="button" variant="secondary" onClick={() => void submit(true)()} disabled={pending}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
