import { z } from 'zod'
import { isValidIsoDate, isValidIsoMonth } from '@/lib/dates'
import { MAX_AMOUNT_MINOR, parseAmountToMinor } from '@/lib/money'
import { isSupportedCurrency } from './currencies'
import { BILL_FREQUENCIES, DATE_FORMATS, PAYMENT_METHODS } from './types'

const currencyCode = z.string().refine(isSupportedCurrency, 'Choose a valid ISO 4217 currency.')
const isoDate = z.string().refine(isValidIsoDate, 'Enter a valid date.')
const isoMonth = z.string().refine(isValidIsoMonth, 'Enter a valid month.')
const amountMinor = z.number().int().positive().max(MAX_AMOUNT_MINOR)
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)
const timestamp = z.string()

/** Validates the amount string against the selected currency's precision. */
function refineAmount(field: string) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const currency = value.currency
    const amount = value[field]
    if (typeof currency !== 'string' || !isSupportedCurrency(currency) || typeof amount !== 'string') return
    const parsed = parseAmountToMinor(amount, currency)
    if (!parsed.ok) ctx.addIssue({ code: 'custom', path: [field], message: parsed.error })
  }
}

// ---------------------------------------------------------------------------
// Form schemas (string inputs as typed by the user)
// ---------------------------------------------------------------------------

export const transactionFormSchema = z
  .object({
    type: z.enum(['income', 'expense']),
    description: z.string().trim().min(1, 'Enter a description.').max(120, 'Keep the description under 120 characters.'),
    amount: z.string(),
    currency: currencyCode,
    categoryId: z.string().min(1, 'Choose a category.'),
    date: isoDate,
    notes: z.string().max(1000, 'Notes are limited to 1,000 characters.'),
    paymentMethod: z.enum([...PAYMENT_METHODS, 'none']),
  })
  .superRefine(refineAmount('amount'))

export type TransactionFormValues = z.input<typeof transactionFormSchema>

export const budgetFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(80, 'Keep the name under 80 characters.'),
    categoryId: z.string().min(1, 'Choose a category.'),
    limit: z.string(),
    currency: currencyCode,
    startMonth: isoMonth,
    endMonth: z.union([z.literal(''), isoMonth]),
    notes: z.string().max(1000, 'Notes are limited to 1,000 characters.'),
  })
  .superRefine(refineAmount('limit'))
  .refine((v) => v.endMonth === '' || v.endMonth >= v.startMonth, {
    path: ['endMonth'],
    message: 'The end month must be on or after the start month.',
  })

export type BudgetFormValues = z.input<typeof budgetFormSchema>

export const recurringBillFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(80, 'Keep the name under 80 characters.'),
    amount: z.string(),
    currency: currencyCode,
    categoryId: z.string().min(1, 'Choose a category.'),
    frequency: z.enum(BILL_FREQUENCIES),
    nextDueDate: isoDate,
    endDate: z.union([z.literal(''), isoDate]),
    notes: z.string().max(1000, 'Notes are limited to 1,000 characters.'),
  })
  .superRefine(refineAmount('amount'))
  .refine((v) => v.endDate === '' || v.endDate >= v.nextDueDate, {
    path: ['endDate'],
    message: 'The end date must be on or after the next due date.',
  })

export type RecurringBillFormValues = z.input<typeof recurringBillFormSchema>

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(40, 'Keep the name under 40 characters.'),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour.'),
})

export type CategoryFormValues = z.input<typeof categoryFormSchema>

// ---------------------------------------------------------------------------
// Stored record schemas (used to validate backups before restoring them)
// ---------------------------------------------------------------------------

export const transactionRecordSchema = z.object({
  id,
  type: z.enum(['income', 'expense']),
  description: z.string().trim().min(1).max(120),
  amountMinor,
  currency: currencyCode,
  categoryId: id,
  date: isoDate,
  notes: z.string().max(1000),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  recurringBillId: id.nullable(),
  recurringDueDate: isoDate.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const categoryRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const budgetRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  categoryId: id,
  limitMinor: amountMinor,
  currency: currencyCode,
  startMonth: isoMonth,
  endMonth: isoMonth.nullable(),
  notes: z.string().max(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const recurringBillRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  amountMinor,
  currency: currencyCode,
  categoryId: id,
  frequency: z.enum(BILL_FREQUENCIES),
  nextDueDate: isoDate,
  anchorDay: z.number().int().min(1).max(31),
  endDate: isoDate.nullable(),
  notes: z.string().max(1000),
  status: z.enum(['active', 'paused', 'ended']),
  lastPaidDate: isoDate.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const settingsSchema = z.object({
  displayCurrency: currencyCode,
  locale: z.string().min(2).max(35),
  dateFormat: z.enum(DATE_FORMATS),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  openingBalances: z
    .array(
      z.object({
        currency: currencyCode,
        amountMinor: z.number().int().min(-MAX_AMOUNT_MINOR).max(MAX_AMOUNT_MINOR),
      }),
    )
    .max(50),
})
