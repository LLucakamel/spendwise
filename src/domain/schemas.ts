import { z } from 'zod'
import { isValidIsoDate, isValidIsoMonth } from '@/lib/dates'
import { MAX_AMOUNT_MINOR, parseAmountToMinor, parseSignedAmountToMinor } from '@/lib/money'
import { isSupportedCurrency } from './currencies'
import {
  ACCOUNT_KINDS,
  BILL_FREQUENCIES,
  DATE_FORMATS,
  DEBT_KINDS,
  EXTRACTION_METHODS,
  INCOME_FREQUENCIES,
  INVOICE_FILE_TYPES,
  INVOICE_KINDS,
  INVOICE_STATUSES,
  LANGUAGES,
  ORIGINS,
  PAYMENT_METHODS,
  SYNC_MODES,
  TRANSACTION_TYPES,
} from './types'

/*
 * Validation messages are translation keys (see src/i18n). Form components translate them.
 */

const currencyCode = z.string().refine(isSupportedCurrency, 'validation.currency')
const isoDate = z.string().refine(isValidIsoDate, 'validation.date')
const isoMonth = z.string().refine(isValidIsoMonth, 'validation.month')
const optionalDate = z.union([z.literal(''), isoDate])
const amountMinor = z.number().int().positive().max(MAX_AMOUNT_MINOR)
const signedMinor = z.number().int().min(-MAX_AMOUNT_MINOR).max(MAX_AMOUNT_MINOR)
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)
const timestamp = z.string()
const notes = z.string().max(1000, 'validation.notesLength')
const name = (max: number) => z.string().trim().min(1, 'validation.nameRequired').max(max, 'validation.tooLong')
const dayOfMonth = z.number().int().min(1).max(31)

/** Validates a decimal amount string against the selected currency's precision. */
function refineAmount(field: string, options: { signed?: boolean; optional?: boolean } = {}) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const currency = value.currency
    const amount = value[field]
    if (typeof currency !== 'string' || !isSupportedCurrency(currency) || typeof amount !== 'string') return
    if (options.optional && amount.trim() === '') return
    const parsed = options.signed ? parseSignedAmountToMinor(amount, currency) : parseAmountToMinor(amount, currency)
    if (!parsed.ok) ctx.addIssue({ code: 'custom', path: [field], message: parsed.error })
  }
}

// ---------------------------------------------------------------------------
// Form schemas (string inputs as typed by the user)
// ---------------------------------------------------------------------------

export const transactionFormSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    description: z.string().trim().min(1, 'validation.descriptionRequired').max(120, 'validation.tooLong'),
    amount: z.string(),
    currency: currencyCode,
    categoryId: z.string(),
    date: isoDate,
    notes,
    paymentMethod: z.enum([...PAYMENT_METHODS, 'none']),
    accountId: z.string(),
    toAccountId: z.string(),
    sourceRef: z.string().max(120, 'validation.tooLong'),
  })
  .superRefine(refineAmount('amount'))
  .superRefine((v, ctx) => {
    if (v.type !== 'transfer' && !v.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'validation.categoryRequired' })
    if (v.type === 'transfer') {
      if (!v.accountId) ctx.addIssue({ code: 'custom', path: ['accountId'], message: 'validation.fromAccountRequired' })
      if (!v.toAccountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'validation.toAccountRequired' })
      if (v.accountId && v.accountId === v.toAccountId) ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'validation.sameAccount' })
    }
  })

export type TransactionFormValues = z.input<typeof transactionFormSchema>

export const budgetFormSchema = z
  .object({
    name: name(80),
    categoryId: z.string().min(1, 'validation.categoryRequired'),
    limit: z.string(),
    currency: currencyCode,
    startMonth: isoMonth,
    endMonth: z.union([z.literal(''), isoMonth]),
    notes,
  })
  .superRefine(refineAmount('limit'))
  .refine((v) => v.endMonth === '' || v.endMonth >= v.startMonth, { path: ['endMonth'], message: 'validation.endBeforeStart' })

export type BudgetFormValues = z.input<typeof budgetFormSchema>

export const recurringBillFormSchema = z
  .object({
    name: name(80),
    amount: z.string(),
    currency: currencyCode,
    categoryId: z.string().min(1, 'validation.categoryRequired'),
    frequency: z.enum(BILL_FREQUENCIES),
    nextDueDate: isoDate,
    endDate: optionalDate,
    accountId: z.string(),
    notes,
  })
  .superRefine(refineAmount('amount'))
  .refine((v) => v.endDate === '' || v.endDate >= v.nextDueDate, { path: ['endDate'], message: 'validation.endBeforeStart' })

export type RecurringBillFormValues = z.input<typeof recurringBillFormSchema>

export const categoryFormSchema = z.object({
  name: name(40),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'validation.color'),
})

export type CategoryFormValues = z.input<typeof categoryFormSchema>

export const accountFormSchema = z
  .object({
    name: name(60),
    kind: z.enum(ACCOUNT_KINDS),
    provider: z.string().trim().max(60, 'validation.tooLong'),
    currency: currencyCode,
    openingBalance: z.string(),
    last4: z.string().regex(/^(\d{4})?$/, 'validation.last4'),
    syncMode: z.enum(SYNC_MODES),
    creditLimit: z.string(),
    statementDay: z.string().regex(/^([1-9]|[12]\d|3[01])?$/, 'validation.day'),
    paymentDueDay: z.string().regex(/^([1-9]|[12]\d|3[01])?$/, 'validation.day'),
    minimumPayment: z.string(),
    notes,
  })
  .superRefine((v, ctx) => {
    if (!isSupportedCurrency(v.currency)) return
    if (v.openingBalance.trim()) {
      const r = parseSignedAmountToMinor(v.openingBalance, v.currency)
      if (!r.ok) ctx.addIssue({ code: 'custom', path: ['openingBalance'], message: r.error })
    }
  })
  .superRefine(refineAmount('creditLimit', { optional: true }))
  .superRefine(refineAmount('minimumPayment', { optional: true }))

export type AccountFormValues = z.input<typeof accountFormSchema>

export const incomeSourceFormSchema = z
  .object({
    name: name(80),
    categoryId: z.string().min(1, 'validation.categoryRequired'),
    description: z.string().max(200, 'validation.tooLong'),
    currency: currencyCode,
    expectedAmount: z.string(),
    frequency: z.enum(INCOME_FREQUENCIES),
    nextExpectedDate: isoDate,
    endDate: optionalDate,
    accountId: z.string(),
    notes,
  })
  .superRefine(refineAmount('expectedAmount'))
  .refine((v) => v.endDate === '' || v.endDate >= v.nextExpectedDate, { path: ['endDate'], message: 'validation.endBeforeStart' })

export type IncomeSourceFormValues = z.input<typeof incomeSourceFormSchema>

export const goalFormSchema = z
  .object({
    name: name(60),
    currency: currencyCode,
    target: z.string(),
    targetDate: optionalDate,
    isEmergencyFund: z.boolean(),
    notes,
  })
  .superRefine(refineAmount('target'))

export type GoalFormValues = z.input<typeof goalFormSchema>

export const debtFormSchema = z
  .object({
    name: name(60),
    kind: z.enum(DEBT_KINDS),
    lender: z.string().trim().max(60, 'validation.tooLong'),
    currency: currencyCode,
    original: z.string(),
    annualRate: z.string().regex(/^(\d{1,3}([.,]\d{1,2})?)?$/, 'validation.rate'),
    minimumPayment: z.string(),
    dueDay: z.string().regex(/^([1-9]|[12]\d|3[01])?$/, 'validation.day'),
    notes,
  })
  .superRefine(refineAmount('original'))
  .superRefine(refineAmount('minimumPayment', { optional: true }))

export type DebtFormValues = z.input<typeof debtFormSchema>

// ---------------------------------------------------------------------------
// Stored record schemas (validate data read from storage and backups).
// Defaults let records written by older versions load correctly.
// ---------------------------------------------------------------------------

export const transactionRecordSchema = z.object({
  id,
  type: z.enum(TRANSACTION_TYPES),
  description: z.string().trim().min(1).max(120),
  amountMinor,
  currency: currencyCode,
  categoryId: id,
  date: isoDate,
  notes: z.string().max(1000),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  accountId: id.nullable().default(null),
  toAccountId: id.nullable().default(null),
  origin: z.enum(ORIGINS).default('manual'),
  sourceRef: z.string().max(120).nullable().default(null),
  importId: id.nullable().default(null),
  recurringBillId: id.nullable(),
  recurringDueDate: isoDate.nullable(),
  incomeSourceId: id.nullable().default(null),
  incomeDueDate: isoDate.nullable().default(null),
  invoiceId: id.nullable().default(null),
  reconciled: z.boolean().default(false),
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
  anchorDay: dayOfMonth,
  endDate: isoDate.nullable(),
  notes: z.string().max(1000),
  status: z.enum(['active', 'paused', 'ended']),
  lastPaidDate: isoDate.nullable(),
  accountId: id.nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const accountRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS),
  provider: z.string().max(60),
  currency: currencyCode,
  openingBalanceMinor: signedMinor,
  last4: z.string().regex(/^(\d{4})?$/),
  syncMode: z.enum(SYNC_MODES),
  creditLimitMinor: amountMinor.nullable(),
  statementDay: dayOfMonth.nullable(),
  paymentDueDay: dayOfMonth.nullable(),
  minimumPaymentMinor: amountMinor.nullable(),
  archived: z.boolean(),
  notes: z.string().max(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const incomeSourceRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  categoryId: id,
  description: z.string().max(200),
  currency: currencyCode,
  expectedAmountMinor: amountMinor,
  frequency: z.enum(INCOME_FREQUENCIES),
  nextExpectedDate: isoDate,
  anchorDay: dayOfMonth,
  endDate: isoDate.nullable(),
  accountId: id.nullable(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled']),
  notes: z.string().max(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const minorOrNull = z.number().int().min(0).max(MAX_AMOUNT_MINOR).nullable()

export const invoiceRecordSchema = z.object({
  id,
  kind: z.enum(INVOICE_KINDS),
  merchant: z.string().max(120),
  merchantAddress: z.string().max(200),
  merchantTaxId: z.string().max(40),
  invoiceNumber: z.string().max(60),
  issueDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  currency: currencyCode,
  subtotalMinor: minorOrNull,
  discountMinor: minorOrNull,
  taxMinor: minorOrNull,
  totalMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
  taxLines: z.array(z.object({ label: z.string().max(60), rate: z.string().max(10), amountMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR) })).max(20),
  lines: z
    .array(z.object({ description: z.string().max(200), quantity: z.string().max(20), unitPriceMinor: minorOrNull, totalMinor: minorOrNull }))
    .max(200),
  categoryId: id.nullable(),
  status: z.enum(INVOICE_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  warrantyUntil: isoDate.nullable(),
  returnBy: isoDate.nullable(),
  qrText: z.string().max(2000),
  extraction: z.enum(EXTRACTION_METHODS),
  rawText: z.string().max(20000),
  linkedTransactionIds: z.array(id).max(50),
  file: z
    .object({
      name: z.string().max(200),
      type: z.enum(INVOICE_FILE_TYPES),
      size: z.number().int().min(1).max(10 * 1024 * 1024),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      storagePath: z.string().max(300),
    })
    .nullable(),
  notes: z.string().max(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const importBatchRecordSchema = z.object({
  id,
  fileName: z.string().max(200),
  format: z.enum(['csv', 'pdf']),
  accountId: id.nullable(),
  rowCount: z.number().int().min(0).max(100000),
  importedCount: z.number().int().min(0).max(100000),
  duplicateCount: z.number().int().min(0).max(100000),
  skippedCount: z.number().int().min(0).max(100000),
  status: z.enum(['completed', 'rolled-back']),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const dated = z.object({ date: isoDate, amountMinor, note: z.string().max(200) })

export const goalRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  currency: currencyCode,
  targetMinor: amountMinor,
  targetDate: isoDate.nullable(),
  isEmergencyFund: z.boolean(),
  contributions: z.array(dated).max(500),
  notes: z.string().max(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const debtRecordSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  kind: z.enum(DEBT_KINDS),
  lender: z.string().max(60),
  currency: currencyCode,
  originalMinor: amountMinor,
  annualRate: z.string().max(8),
  minimumPaymentMinor: amountMinor.nullable(),
  dueDay: dayOfMonth.nullable(),
  payments: z.array(dated).max(500),
  notes: z.string().max(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const settingsSchema = z.object({
  displayCurrency: currencyCode,
  locale: z.string().min(2).max(35),
  language: z.enum(LANGUAGES).default('en'),
  dateFormat: z.enum(DATE_FORMATS),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  openingBalances: z.array(z.object({ currency: currencyCode, amountMinor: signedMinor })).max(50),
})
