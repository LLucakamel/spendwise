/**
 * Transaction semantics:
 * - income: money received (salary, freelance…). Counts as income.
 * - expense: money spent. Counts as an expense.
 * - refund: money returned for an earlier purchase. Reduces expenses in its category; never income.
 * - transfer: money moved between the user's own accounts (including paying a credit card).
 *   Never counted as income or expense.
 */
export const TRANSACTION_TYPES = ['income', 'expense', 'refund', 'transfer'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const PAYMENT_METHODS = [
  'cash',
  'debit-card',
  'credit-card',
  'bank-transfer',
  'instapay',
  'mobile-wallet',
  'paypal',
  'other',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Where a record came from. */
export const ORIGINS = ['manual', 'import', 'bill', 'income', 'invoice'] as const
export type Origin = (typeof ORIGINS)[number]

/** Synthetic category used by transfers; it is not stored in the categories collection. */
export const TRANSFER_CATEGORY_ID = 'transfer'

/** A calendar date with no time zone, formatted `YYYY-MM-DD`. */
export type IsoDate = string
/** A calendar month, formatted `YYYY-MM`. */
export type IsoMonth = string

export interface Transaction {
  id: string
  type: TransactionType
  description: string
  /** Amount in the currency's ISO 4217 minor units (e.g. cents). Always a positive integer. */
  amountMinor: number
  currency: string
  categoryId: string
  date: IsoDate
  notes: string
  paymentMethod: PaymentMethod | null
  /** Account the money left (expense, transfer) or arrived in (income, refund). */
  accountId: string | null
  /** Destination account of a transfer. */
  toAccountId: string | null
  origin: Origin
  /** External reference (bank reference, receipt number, import row key). */
  sourceRef: string | null
  importId: string | null
  /** Set when the expense was recorded from a recurring bill. */
  recurringBillId: string | null
  /** The bill due date this expense settles; unique per bill. */
  recurringDueDate: IsoDate | null
  /** Set when the income was recorded against an income source. */
  incomeSourceId: string | null
  /** The expected payment date this receipt belongs to. */
  incomeDueDate: IsoDate | null
  invoiceId: string | null
  reconciled: boolean
  createdAt: string
  updatedAt: string
}

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

export interface Category {
  id: string
  name: string
  type: 'income' | 'expense'
  color: string
  createdAt: string
  updatedAt: string
}

export type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>

export interface Budget {
  id: string
  name: string
  categoryId: string
  limitMinor: number
  currency: string
  startMonth: IsoMonth
  endMonth: IsoMonth | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type BudgetInput = Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>

export const BILL_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
export type BillFrequency = (typeof BILL_FREQUENCIES)[number]

export type BillStatus = 'active' | 'paused' | 'ended'

export interface RecurringBill {
  id: string
  name: string
  amountMinor: number
  currency: string
  categoryId: string
  frequency: BillFrequency
  nextDueDate: IsoDate
  anchorDay: number
  endDate: IsoDate | null
  notes: string
  status: BillStatus
  lastPaidDate: IsoDate | null
  accountId: string | null
  createdAt: string
  updatedAt: string
}

export type RecurringBillInput = Omit<RecurringBill, 'id' | 'createdAt' | 'updatedAt'>

// ---------------------------------------------------------------------------
// Accounts and cards
// ---------------------------------------------------------------------------

export const ACCOUNT_KINDS = ['cash', 'bank', 'debit-card', 'credit-card', 'paypal', 'instapay', 'mobile-wallet', 'other'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/** How an account's records get into SpendWise. Direct connections are not available (see docs/RESEARCH.md). */
export const SYNC_MODES = ['manual', 'import'] as const
export type SyncMode = (typeof SYNC_MODES)[number]

export interface Account {
  id: string
  name: string
  kind: AccountKind
  provider: string
  currency: string
  /** Balance before the first recorded transaction. For credit cards a negative value is money owed. */
  openingBalanceMinor: number
  /** Last four digits only, for recognition. Full card numbers are never stored. */
  last4: string
  syncMode: SyncMode
  /** Credit cards only. */
  creditLimitMinor: number | null
  statementDay: number | null
  paymentDueDay: number | null
  minimumPaymentMinor: number | null
  archived: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export const INCOME_FREQUENCIES = ['once', 'weekly', 'monthly', 'quarterly', 'yearly'] as const
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number]

export type IncomeSourceStatus = 'active' | 'paused' | 'completed' | 'cancelled'

/** An expected stream of income. Expected amounts are forecasts, never counted as received. */
export interface IncomeSource {
  id: string
  name: string
  categoryId: string
  description: string
  currency: string
  expectedAmountMinor: number
  frequency: IncomeFrequency
  /** Date of the next expected payment that hasn't been fully received. */
  nextExpectedDate: IsoDate
  anchorDay: number
  endDate: IsoDate | null
  accountId: string | null
  status: IncomeSourceStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export type IncomeSourceInput = Omit<IncomeSource, 'id' | 'createdAt' | 'updatedAt'>

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = ['unpaid', 'paid', 'partially-paid', 'cancelled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_KINDS = ['receipt', 'tax-invoice', 'utility-bill', 'e-invoice', 'e-receipt', 'other'] as const
export type InvoiceKind = (typeof INVOICE_KINDS)[number]

/** How the invoice data was obtained. */
export const EXTRACTION_METHODS = ['manual', 'ocr', 'pdf-text', 'eta-json', 'ubl-xml', 'zatca-qr'] as const
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number]

export interface InvoiceLine {
  description: string
  quantity: string
  unitPriceMinor: number | null
  totalMinor: number | null
}

export interface TaxLine {
  label: string
  rate: string
  amountMinor: number
}

export const INVOICE_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/json', 'application/xml'] as const
export type InvoiceFileType = (typeof INVOICE_FILE_TYPES)[number]

export interface InvoiceFile {
  name: string
  type: InvoiceFileType
  size: number
  /** SHA-256 of the file content, used for duplicate detection. */
  sha256: string
  /** Private storage path (Firebase Storage) or local key (demo). Never a public URL. */
  storagePath: string
}

export interface Invoice {
  id: string
  kind: InvoiceKind
  merchant: string
  merchantAddress: string
  merchantTaxId: string
  invoiceNumber: string
  issueDate: IsoDate | null
  dueDate: IsoDate | null
  currency: string
  subtotalMinor: number | null
  discountMinor: number | null
  taxMinor: number | null
  totalMinor: number
  taxLines: TaxLine[]
  lines: InvoiceLine[]
  categoryId: string | null
  /** Status as recorded by the user. A payment is only confirmed by linked transactions. */
  status: InvoiceStatus
  paymentMethod: PaymentMethod | null
  warrantyUntil: IsoDate | null
  returnBy: IsoDate | null
  qrText: string
  extraction: ExtractionMethod
  /** Original recognised text, kept for reference (may be empty). */
  rawText: string
  linkedTransactionIds: string[]
  file: InvoiceFile | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>

// ---------------------------------------------------------------------------
// Imports, goals, debts
// ---------------------------------------------------------------------------

export interface ImportBatch {
  id: string
  fileName: string
  format: 'csv' | 'pdf'
  accountId: string | null
  rowCount: number
  importedCount: number
  duplicateCount: number
  skippedCount: number
  status: 'completed' | 'rolled-back'
  createdAt: string
  updatedAt: string
}

export type ImportBatchInput = Omit<ImportBatch, 'id' | 'createdAt' | 'updatedAt'>

export interface GoalContribution {
  date: IsoDate
  amountMinor: number
  note: string
}

export interface SavingsGoal {
  id: string
  name: string
  currency: string
  targetMinor: number
  targetDate: IsoDate | null
  isEmergencyFund: boolean
  contributions: GoalContribution[]
  notes: string
  createdAt: string
  updatedAt: string
}

export type SavingsGoalInput = Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>

export const DEBT_KINDS = ['loan', 'personal', 'installment', 'mortgage', 'other'] as const
export type DebtKind = (typeof DEBT_KINDS)[number]

export interface DebtPayment {
  date: IsoDate
  amountMinor: number
  note: string
}

export interface Debt {
  id: string
  name: string
  kind: DebtKind
  lender: string
  currency: string
  /** Balance owed when the debt was added. */
  originalMinor: number
  /** Annual interest rate in percent as text (e.g. "18.5"), used only for estimates. */
  annualRate: string
  minimumPaymentMinor: number | null
  dueDay: number | null
  payments: DebtPayment[]
  notes: string
  createdAt: string
  updatedAt: string
}

export type DebtInput = Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface OpeningBalance {
  currency: string
  amountMinor: number
}

export const DATE_FORMATS = ['locale', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'd MMM yyyy'] as const
export type DateFormatPreference = (typeof DATE_FORMATS)[number]

export type WeekStart = 0 | 1 | 6

export const LANGUAGES = ['en', 'ar'] as const
export type Language = (typeof LANGUAGES)[number]

export interface Settings {
  displayCurrency: string
  locale: string
  language: Language
  dateFormat: DateFormatPreference
  weekStartsOn: WeekStart
  /** Opening balances not tied to a specific account. */
  openingBalances: OpeningBalance[]
}

export interface FinanceData {
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  recurringBills: RecurringBill[]
  accounts: Account[]
  incomeSources: IncomeSource[]
  invoices: Invoice[]
  imports: ImportBatch[]
  goals: SavingsGoal[]
  debts: Debt[]
  settings: Settings
  /** True when the cloud query hit its safety limit, so the oldest transactions were not loaded. */
  transactionLimitReached?: boolean
}
