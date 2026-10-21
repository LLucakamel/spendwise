import type { DataRepository, Unsubscribe } from '@/data/repository'
import { DEFAULT_CATEGORIES, defaultSettings } from '@/domain/defaults'
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
import type { Backup } from '@/lib/backup'
import { todayIso } from '@/lib/dates'
import { billAfterOccurrence, billPaymentTransactionId, DuplicatePaymentError, isOccurrenceRecorded } from '@/lib/recurring'
import { generateDemoData } from './demoData'

/** Demo data lives only under this key in the visitor's browser and never leaves it. */
export const DEMO_STORAGE_KEY = 'spendwise.demo.v1'

const LATENCY_MS = 60

interface StoredDemo {
  version: 1
  data: FinanceData
}

function readStorage(): FinanceData | null {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDemo
    return parsed.version === 1 ? parsed.data : null
  } catch {
    return null
  }
}

function writeStorage(data: FinanceData): void {
  try {
    const payload: StoredDemo = { version: 1, data }
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage may be unavailable (private mode, quota). The demo keeps working in memory.
  }
}

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS))

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no longer exists.`)
    this.name = 'NotFoundError'
  }
}

/**
 * Local, browser-only repository for the demo experience. It has no network code at all,
 * so demo records cannot reach Firebase.
 */
export class DemoRepository implements DataRepository {
  readonly kind = 'demo' as const
  private data: FinanceData
  private listeners = new Set<(data: FinanceData) => void>()

  constructor(initial?: FinanceData) {
    this.data = initial ?? readStorage() ?? generateDemoData(todayIso())
    if (!initial) writeStorage(this.data)
  }

  subscribe(onData: (data: FinanceData) => void): Unsubscribe {
    this.listeners.add(onData)
    queueMicrotask(() => onData(this.data))
    return () => this.listeners.delete(onData)
  }

  newId(): string {
    return `demo-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
  }

  private commit(next: FinanceData) {
    this.data = next
    writeStorage(next)
    for (const listener of this.listeners) listener(next)
  }

  private now() {
    return new Date().toISOString()
  }

  /** Replaces all demo data with a freshly generated sample set. */
  async resetToSample(): Promise<void> {
    await wait()
    this.commit(generateDemoData(todayIso()))
  }

  async createTransaction(id: string, input: TransactionInput) {
    await wait()
    if (this.data.transactions.some((t) => t.id === id)) return
    const now = this.now()
    this.commit({ ...this.data, transactions: [{ ...input, id, createdAt: now, updatedAt: now }, ...this.data.transactions] })
  }

  async updateTransaction(id: string, input: TransactionInput) {
    await wait()
    const existing = this.data.transactions.find((t) => t.id === id)
    if (!existing) throw new NotFoundError('This transaction')
    this.commit({
      ...this.data,
      transactions: this.data.transactions.map((t) => (t.id === id ? { ...t, ...input, updatedAt: this.now() } : t)),
    })
  }

  async deleteTransaction(id: string) {
    await wait()
    this.commit({ ...this.data, transactions: this.data.transactions.filter((t) => t.id !== id) })
  }

  async createCategory(id: string, input: CategoryInput) {
    await wait()
    const now = this.now()
    this.commit({ ...this.data, categories: [...this.data.categories, { ...input, id, createdAt: now, updatedAt: now }] })
  }

  async updateCategory(id: string, input: CategoryInput) {
    await wait()
    this.commit({
      ...this.data,
      categories: this.data.categories.map((c) => (c.id === id ? { ...c, ...input, updatedAt: this.now() } : c)),
    })
  }

  async deleteCategory(id: string) {
    await wait()
    this.commit({ ...this.data, categories: this.data.categories.filter((c) => c.id !== id) })
  }

  async createBudget(id: string, input: BudgetInput) {
    await wait()
    if (this.data.budgets.some((b) => b.id === id)) return
    const now = this.now()
    this.commit({ ...this.data, budgets: [...this.data.budgets, { ...input, id, createdAt: now, updatedAt: now }] })
  }

  async updateBudget(id: string, input: BudgetInput) {
    await wait()
    if (!this.data.budgets.some((b) => b.id === id)) throw new NotFoundError('This budget')
    this.commit({
      ...this.data,
      budgets: this.data.budgets.map((b) => (b.id === id ? { ...b, ...input, updatedAt: this.now() } : b)),
    })
  }

  async deleteBudget(id: string) {
    await wait()
    this.commit({ ...this.data, budgets: this.data.budgets.filter((b) => b.id !== id) })
  }

  async createRecurringBill(id: string, input: RecurringBillInput) {
    await wait()
    if (this.data.recurringBills.some((b) => b.id === id)) return
    const now = this.now()
    this.commit({
      ...this.data,
      recurringBills: [...this.data.recurringBills, { ...input, id, createdAt: now, updatedAt: now }],
    })
  }

  async updateRecurringBill(id: string, input: Partial<RecurringBillInput>) {
    await wait()
    if (!this.data.recurringBills.some((b) => b.id === id)) throw new NotFoundError('This bill')
    this.commit({
      ...this.data,
      recurringBills: this.data.recurringBills.map((b) => (b.id === id ? { ...b, ...input, updatedAt: this.now() } : b)),
    })
  }

  async deleteRecurringBill(id: string) {
    await wait()
    this.commit({ ...this.data, recurringBills: this.data.recurringBills.filter((b) => b.id !== id) })
  }

  async recordBillPayment(bill: RecurringBill, paymentDate: IsoDate): Promise<string> {
    await wait()
    const current = this.data.recurringBills.find((b) => b.id === bill.id)
    if (!current) throw new NotFoundError('This bill')
    // Re-check against the latest stored state, not the caller's copy, to block double submissions.
    if (current.nextDueDate !== bill.nextDueDate || isOccurrenceRecorded(this.data.transactions, bill.id, bill.nextDueDate)) {
      throw new DuplicatePaymentError(bill.nextDueDate)
    }
    const id = billPaymentTransactionId(bill.id, current.nextDueDate)
    const now = this.now()
    const after = billAfterOccurrence(current, paymentDate)
    this.commit({
      ...this.data,
      transactions: [
        {
          id,
          type: 'expense',
          description: current.name,
          amountMinor: current.amountMinor,
          currency: current.currency,
          categoryId: current.categoryId,
          date: paymentDate,
          notes: `Payment for the bill due ${current.nextDueDate}.`,
          paymentMethod: null,
          recurringBillId: current.id,
          recurringDueDate: current.nextDueDate,
          createdAt: now,
          updatedAt: now,
        },
        ...this.data.transactions,
      ],
      recurringBills: this.data.recurringBills.map((b) => (b.id === current.id ? { ...b, ...after, updatedAt: now } : b)),
    })
    return id
  }

  async skipBillOccurrence(bill: RecurringBill) {
    await wait()
    const current = this.data.recurringBills.find((b) => b.id === bill.id)
    if (!current) throw new NotFoundError('This bill')
    if (current.nextDueDate !== bill.nextDueDate) return
    const after = billAfterOccurrence(current, null)
    this.commit({
      ...this.data,
      recurringBills: this.data.recurringBills.map((b) => (b.id === current.id ? { ...b, ...after, updatedAt: this.now() } : b)),
    })
  }

  async updateSettings(patch: Partial<Settings>) {
    await wait()
    this.commit({ ...this.data, settings: { ...this.data.settings, ...patch } })
  }

  async restoreBackup(backup: Backup) {
    await wait()
    const merge = <T extends { id: string }>(existing: T[], incoming: T[]) => {
      const map = new Map(existing.map((r) => [r.id, r]))
      for (const r of incoming) map.set(r.id, r)
      return [...map.values()]
    }
    const d = backup.data
    this.commit({
      settings: d.settings,
      categories: merge(this.data.categories, d.categories),
      transactions: merge(this.data.transactions, d.transactions),
      budgets: merge(this.data.budgets, d.budgets),
      recurringBills: merge(this.data.recurringBills, d.recurringBills),
    })
  }

  /** Empties the demo sandbox; default categories are kept so the empty demo stays usable. */
  async deleteAllData() {
    await wait()
    const now = this.now()
    this.commit({
      transactions: [],
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now, updatedAt: now })),
      budgets: [],
      recurringBills: [],
      settings: defaultSettings(),
    })
  }
}
