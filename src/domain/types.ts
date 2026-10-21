export type TransactionType = 'income' | 'expense'

export const PAYMENT_METHODS = [
  'cash',
  'debit-card',
  'credit-card',
  'bank-transfer',
  'mobile-wallet',
  'other',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  'debit-card': 'Debit card',
  'credit-card': 'Credit card',
  'bank-transfer': 'Bank transfer',
  'mobile-wallet': 'Mobile wallet',
  other: 'Other',
}

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
  /** Set when the expense was recorded from a recurring bill. */
  recurringBillId: string | null
  /** The bill due date this expense settles; unique per bill. */
  recurringDueDate: IsoDate | null
  createdAt: string
  updatedAt: string
}

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>

export interface Category {
  id: string
  name: string
  type: TransactionType
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
  /** First month the monthly limit applies to. */
  startMonth: IsoMonth
  /** Last month the limit applies to, or null for an ongoing budget. */
  endMonth: IsoMonth | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type BudgetInput = Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>

export const BILL_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
export type BillFrequency = (typeof BILL_FREQUENCIES)[number]

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export type BillStatus = 'active' | 'paused' | 'ended'

export interface RecurringBill {
  id: string
  name: string
  amountMinor: number
  currency: string
  categoryId: string
  frequency: BillFrequency
  nextDueDate: IsoDate
  /** Preferred day of month for monthly/quarterly/yearly bills, so 31st-of-month bills stay on month ends. */
  anchorDay: number
  endDate: IsoDate | null
  notes: string
  status: BillStatus
  lastPaidDate: IsoDate | null
  createdAt: string
  updatedAt: string
}

export type RecurringBillInput = Omit<RecurringBill, 'id' | 'createdAt' | 'updatedAt'>

export interface OpeningBalance {
  currency: string
  /** May be negative (e.g. an overdrawn account). */
  amountMinor: number
}

export const DATE_FORMATS = ['locale', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'd MMM yyyy'] as const
export type DateFormatPreference = (typeof DATE_FORMATS)[number]

export type WeekStart = 0 | 1 | 6

export interface Settings {
  displayCurrency: string
  locale: string
  dateFormat: DateFormatPreference
  weekStartsOn: WeekStart
  openingBalances: OpeningBalance[]
}

export interface FinanceData {
  transactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  recurringBills: RecurringBill[]
  settings: Settings
}
