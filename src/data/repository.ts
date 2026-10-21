import type { Backup } from '@/lib/backup'
import type {
  BudgetInput,
  CategoryInput,
  FinanceData,
  IsoDate,
  RecurringBill,
  RecurringBillInput,
  Settings,
  TransactionInput,
} from '@/domain/types'

export type Unsubscribe = () => void

/**
 * Storage boundary shared by demo mode and Firebase mode. Each implementation is bound to
 * exactly one data owner (the demo sandbox or one signed-in user) when it is constructed,
 * so callers cannot address another owner's records.
 */
export interface DataRepository {
  readonly kind: 'demo' | 'firebase'

  subscribe(onData: (data: FinanceData) => void, onError: (error: unknown) => void): Unsubscribe

  /** Generates an ID up front so a retried save targets the same record instead of creating a duplicate. */
  newId(): string

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
  /**
   * Records the bill's current occurrence as an expense dated `paymentDate` and advances the bill.
   * Throws DuplicatePaymentError if that occurrence has already been recorded.
   * Returns the ID of the created transaction.
   */
  recordBillPayment(bill: RecurringBill, paymentDate: IsoDate): Promise<string>
  /** Advances the bill to its next due date without recording an expense. */
  skipBillOccurrence(bill: RecurringBill): Promise<void>

  updateSettings(patch: Partial<Settings>): Promise<void>

  /** Adds or replaces records from a backup, matching by ID. Records not in the backup are kept. */
  restoreBackup(backup: Backup): Promise<void>
  /** Permanently removes every record owned by this repository's owner. */
  deleteAllData(): Promise<void>
}
