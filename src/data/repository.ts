import type {
  AccountInput,
  BudgetInput,
  CategoryInput,
  DebtInput,
  FinanceData,
  ImportBatchInput,
  IncomeSource,
  IncomeSourceInput,
  InvoiceInput,
  IsoDate,
  RecurringBill,
  RecurringBillInput,
  SavingsGoalInput,
  Settings,
  TransactionInput,
} from '@/domain/types'
import type { Backup } from '@/lib/backup'

export type Unsubscribe = () => void

/** Inputs per stored collection. */
export interface CollectionInputs {
  categories: CategoryInput
  transactions: TransactionInput
  budgets: BudgetInput
  recurringBills: RecurringBillInput
  accounts: AccountInput
  incomeSources: IncomeSourceInput
  invoices: InvoiceInput
  imports: ImportBatchInput
  goals: SavingsGoalInput
  debts: DebtInput
}

export type CollectionName = keyof CollectionInputs

export const COLLECTIONS: readonly CollectionName[] = [
  'categories',
  'transactions',
  'budgets',
  'recurringBills',
  'accounts',
  'incomeSources',
  'invoices',
  'imports',
  'goals',
  'debts',
]

export interface IncomeReceipt {
  amountMinor: number
  date: IsoDate
  accountId: string | null
  notes: string
  sourceRef: string | null
}

export interface ImportRowInput {
  id: string
  input: TransactionInput
}

/**
 * Storage boundary shared by demo mode and Firebase mode. Each implementation is bound to exactly
 * one data owner (the demo sandbox or one signed-in user) when constructed, so callers cannot
 * address another owner's records.
 */
export interface DataRepository {
  readonly kind: 'demo' | 'firebase'

  subscribe(onData: (data: FinanceData) => void, onError: (error: unknown) => void): Unsubscribe

  /** Generates an ID up front so a retried save targets the same record instead of creating a duplicate. */
  newId(): string

  create<K extends CollectionName>(collection: K, id: string, input: CollectionInputs[K]): Promise<void>
  update<K extends CollectionName>(collection: K, id: string, patch: Partial<CollectionInputs[K]>): Promise<void>
  remove(collection: CollectionName, id: string): Promise<void>

  /** Records the bill's current occurrence as an expense and advances the bill. Throws DuplicatePaymentError if already recorded. */
  /** `accountId` defaults to the bill's usual account; pass null to record it without an account. */
  recordBillPayment(bill: RecurringBill, paymentDate: IsoDate, accountId?: string | null): Promise<string>
  skipBillOccurrence(bill: RecurringBill): Promise<void>

  /**
   * Records (part of) the income expected on `source.nextExpectedDate` as an income transaction with
   * ID `receiptId`. When `completesOccurrence` is true the source moves to its next expected date.
   * Throws DuplicatePaymentError if `receiptId` already exists.
   */
  recordIncomeReceipt(source: IncomeSource, receipt: IncomeReceipt, receiptId: string, completesOccurrence: boolean): Promise<void>
  /** Moves an income source past its current expected date without recording money. */
  skipIncomeOccurrence(source: IncomeSource): Promise<void>

  /** Creates the batch and every row whose ID doesn't exist yet. Returns how many were created. */
  importTransactions(batchId: string, batch: ImportBatchInput, rows: ImportRowInput[]): Promise<{ imported: number; alreadyPresent: number }>
  /** Deletes every transaction created by the batch and marks it rolled back. */
  rollbackImport(batchId: string): Promise<void>

  /** Links or unlinks an invoice and an expense on both records atomically. */
  setInvoiceLink(invoiceId: string, transactionId: string, linked: boolean): Promise<void>

  /** Stores an invoice file privately and returns its storage path. */
  saveInvoiceFile(invoiceId: string, file: Blob, fileName: string, sha256: string): Promise<string>
  loadInvoiceFile(storagePath: string): Promise<Blob | null>
  deleteInvoiceFile(storagePath: string): Promise<void>

  updateSettings(patch: Partial<Settings>): Promise<void>

  /** Adds or replaces records from a backup, matching by ID. Records not in the backup are kept. */
  restoreBackup(backup: Backup): Promise<void>
  /** Permanently removes every record and file owned by this repository's owner. */
  deleteAllData(): Promise<void>

  // Convenience wrappers used throughout the UI.
  createTransaction(id: string, input: TransactionInput): Promise<void>
  updateTransaction(id: string, input: TransactionInput): Promise<void>
  deleteTransaction(id: string): Promise<void>
  createCategory(id: string, input: CategoryInput): Promise<void>
  updateCategory(id: string, input: CategoryInput): Promise<void>
  deleteCategory(id: string): Promise<void>
  createBudget(id: string, input: BudgetInput): Promise<void>
  updateBudget(id: string, input: BudgetInput): Promise<void>
  deleteBudget(id: string): Promise<void>
  createRecurringBill(id: string, input: RecurringBillInput): Promise<void>
  updateRecurringBill(id: string, input: Partial<RecurringBillInput>): Promise<void>
  deleteRecurringBill(id: string): Promise<void>
}

/** Implements the convenience wrappers on top of create/update/remove. */
export abstract class BaseRepository {
  abstract create<K extends CollectionName>(collection: K, id: string, input: CollectionInputs[K]): Promise<void>
  abstract update<K extends CollectionName>(collection: K, id: string, patch: Partial<CollectionInputs[K]>): Promise<void>
  abstract remove(collection: CollectionName, id: string): Promise<void>

  createTransaction(id: string, input: TransactionInput) {
    return this.create('transactions', id, input)
  }
  updateTransaction(id: string, input: TransactionInput) {
    return this.update('transactions', id, input)
  }
  deleteTransaction(id: string) {
    return this.remove('transactions', id)
  }
  createCategory(id: string, input: CategoryInput) {
    return this.create('categories', id, input)
  }
  updateCategory(id: string, input: CategoryInput) {
    return this.update('categories', id, input)
  }
  deleteCategory(id: string) {
    return this.remove('categories', id)
  }
  createBudget(id: string, input: BudgetInput) {
    return this.create('budgets', id, input)
  }
  updateBudget(id: string, input: BudgetInput) {
    return this.update('budgets', id, input)
  }
  deleteBudget(id: string) {
    return this.remove('budgets', id)
  }
  createRecurringBill(id: string, input: RecurringBillInput) {
    return this.create('recurringBills', id, input)
  }
  updateRecurringBill(id: string, input: Partial<RecurringBillInput>) {
    return this.update('recurringBills', id, input)
  }
  deleteRecurringBill(id: string) {
    return this.remove('recurringBills', id)
  }
}

/** Blank transaction fields shared by every code path that creates transactions. */
export const TRANSACTION_DEFAULTS = {
  notes: '',
  paymentMethod: null,
  accountId: null,
  toAccountId: null,
  origin: 'manual',
  sourceRef: null,
  importId: null,
  recurringBillId: null,
  recurringDueDate: null,
  incomeSourceId: null,
  incomeDueDate: null,
  invoiceId: null,
  reconciled: false,
} as const satisfies Partial<TransactionInput>
