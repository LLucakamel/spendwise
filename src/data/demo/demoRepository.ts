import {
  BaseRepository,
  COLLECTIONS,
  TRANSACTION_DEFAULTS,
  type CollectionInputs,
  type CollectionName,
  type DataRepository,
  type ImportRowInput,
  type IncomeReceipt,
  type Unsubscribe,
} from '@/data/repository'
import { DEFAULT_CATEGORIES, defaultSettings, detectLanguage } from '@/domain/defaults'
import type { FinanceData, ImportBatchInput, IncomeSource, IsoDate, RecurringBill, Settings, Transaction } from '@/domain/types'
import type { Backup } from '@/lib/backup'
import { todayIso } from '@/lib/dates'
import { billAfterOccurrence, billPaymentTransactionId, DuplicatePaymentError, isOccurrenceRecorded } from '@/lib/recurring'
import { sourceAfterReceipt } from '@/lib/income'
import { clearLocalFiles, deleteLocalFile, getLocalFile, putLocalFile } from '@/data/localFiles'
import { generateDemoData } from './demoData'

/** Demo data lives only under this key in the visitor's browser and never leaves it. */
export const DEMO_STORAGE_KEY = 'spendwise.demo.v2'
const LEGACY_KEYS = ['spendwise.demo.v1']

const LATENCY_MS = 60

interface StoredDemo {
  version: 2
  data: FinanceData
}

function readStorage(): FinanceData | null {
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key)
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDemo
    return parsed.version === 2 ? parsed.data : null
  } catch {
    return null
  }
}

function writeStorage(data: FinanceData): void {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ version: 2, data } satisfies StoredDemo))
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

type Stored<K extends CollectionName> = CollectionInputs[K] & { id: string; createdAt: string; updatedAt: string }

/**
 * Local, browser-only repository for the demo experience. It has no network code, so demo
 * records cannot reach Firebase.
 */
export class DemoRepository extends BaseRepository implements DataRepository {
  readonly kind = 'demo' as const
  private data: FinanceData
  private listeners = new Set<(data: FinanceData) => void>()

  constructor(initial?: FinanceData) {
    super()
    this.data = initial ?? readStorage() ?? generateDemoData(todayIso(), detectLanguage())
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

  private list<K extends CollectionName>(collection: K): Stored<K>[] {
    return this.data[collection] as unknown as Stored<K>[]
  }

  private withList<K extends CollectionName>(collection: K, items: Stored<K>[]): FinanceData {
    return { ...this.data, [collection]: items }
  }

  async resetToSample(): Promise<void> {
    await wait()
    await clearLocalFiles('demo/')
    this.commit(generateDemoData(todayIso(), this.data.settings.language))
  }

  async create<K extends CollectionName>(collection: K, id: string, input: CollectionInputs[K]) {
    await wait()
    if (this.list(collection).some((r) => r.id === id)) return
    const now = this.now()
    const record = { ...input, id, createdAt: now, updatedAt: now } as Stored<K>
    this.commit(this.withList(collection, collection === 'transactions' ? [record, ...this.list(collection)] : [...this.list(collection), record]))
  }

  async update<K extends CollectionName>(collection: K, id: string, patch: Partial<CollectionInputs[K]>) {
    await wait()
    if (!this.list(collection).some((r) => r.id === id)) throw new NotFoundError('This record')
    this.commit(this.withList(collection, this.list(collection).map((r) => (r.id === id ? { ...r, ...patch, updatedAt: this.now() } : r))))
  }

  async remove(collection: CollectionName, id: string) {
    await wait()
    let next = this.withList(collection, this.list(collection).filter((r) => r.id !== id))
    // Keep links consistent: unlinking happens on both sides.
    if (collection === 'transactions') {
      next = { ...next, invoices: next.invoices.map((inv) => (inv.linkedTransactionIds.includes(id) ? { ...inv, linkedTransactionIds: inv.linkedTransactionIds.filter((t) => t !== id) } : inv)) }
    }
    if (collection === 'invoices') {
      next = { ...next, transactions: next.transactions.map((t) => (t.invoiceId === id ? { ...t, invoiceId: null } : t)) }
    }
    this.commit(next)
  }

  async recordBillPayment(bill: RecurringBill, paymentDate: IsoDate, accountId?: string | null): Promise<string> {
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
    const tx: Transaction = {
      ...TRANSACTION_DEFAULTS,
      id,
      type: 'expense',
      description: current.name,
      amountMinor: current.amountMinor,
      currency: current.currency,
      categoryId: current.categoryId,
      date: paymentDate,
      notes: `Payment for the bill due ${current.nextDueDate}.`,
      accountId: accountId === undefined ? current.accountId : accountId,
      origin: 'bill',
      recurringBillId: current.id,
      recurringDueDate: current.nextDueDate,
      createdAt: now,
      updatedAt: now,
    }
    this.commit({
      ...this.data,
      transactions: [tx, ...this.data.transactions],
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

  async recordIncomeReceipt(source: IncomeSource, receipt: IncomeReceipt, receiptId: string, completesOccurrence: boolean) {
    await wait()
    const current = this.data.incomeSources.find((s) => s.id === source.id)
    if (!current) throw new NotFoundError('This income source')
    if (this.data.transactions.some((t) => t.id === receiptId) || current.nextExpectedDate !== source.nextExpectedDate) {
      throw new DuplicatePaymentError(source.nextExpectedDate)
    }
    const now = this.now()
    const tx: Transaction = {
      ...TRANSACTION_DEFAULTS,
      id: receiptId,
      type: 'income',
      description: current.name,
      amountMinor: receipt.amountMinor,
      currency: current.currency,
      categoryId: current.categoryId,
      date: receipt.date,
      notes: receipt.notes,
      accountId: receipt.accountId,
      origin: 'income',
      sourceRef: receipt.sourceRef,
      incomeSourceId: current.id,
      incomeDueDate: current.nextExpectedDate,
      createdAt: now,
      updatedAt: now,
    }
    const after = sourceAfterReceipt(current, completesOccurrence)
    this.commit({
      ...this.data,
      transactions: [tx, ...this.data.transactions],
      incomeSources: this.data.incomeSources.map((s) => (s.id === current.id ? { ...s, ...after, updatedAt: now } : s)),
    })
  }

  async skipIncomeOccurrence(source: IncomeSource) {
    await wait()
    const current = this.data.incomeSources.find((s) => s.id === source.id)
    if (!current || current.nextExpectedDate !== source.nextExpectedDate) return
    const after = sourceAfterReceipt(current, true)
    this.commit({ ...this.data, incomeSources: this.data.incomeSources.map((s) => (s.id === current.id ? { ...s, ...after, updatedAt: this.now() } : s)) })
  }

  async importTransactions(batchId: string, batch: ImportBatchInput, rows: ImportRowInput[]) {
    await wait()
    const existing = new Set(this.data.transactions.map((t) => t.id))
    const now = this.now()
    const fresh = rows.filter((r) => !existing.has(r.id)).map<Transaction>((r) => ({ ...r.input, id: r.id, createdAt: now, updatedAt: now }))
    this.commit({
      ...this.data,
      transactions: [...fresh, ...this.data.transactions],
      imports: [...this.data.imports.filter((b) => b.id !== batchId), { ...batch, importedCount: fresh.length, id: batchId, createdAt: now, updatedAt: now }],
    })
    return { imported: fresh.length, alreadyPresent: rows.length - fresh.length }
  }

  async rollbackImport(batchId: string) {
    await wait()
    this.commit({
      ...this.data,
      transactions: this.data.transactions.filter((t) => t.importId !== batchId),
      imports: this.data.imports.map((b) => (b.id === batchId ? { ...b, status: 'rolled-back', updatedAt: this.now() } : b)),
    })
  }

  async setInvoiceLink(invoiceId: string, transactionId: string, linked: boolean) {
    await wait()
    const now = this.now()
    this.commit({
      ...this.data,
      invoices: this.data.invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              linkedTransactionIds: linked ? [...new Set([...inv.linkedTransactionIds, transactionId])] : inv.linkedTransactionIds.filter((t) => t !== transactionId),
              updatedAt: now,
            }
          : inv,
      ),
      transactions: this.data.transactions.map((t) => (t.id === transactionId ? { ...t, invoiceId: linked ? invoiceId : null, updatedAt: now } : t)),
    })
  }

  async saveInvoiceFile(invoiceId: string, file: Blob, _fileName: string, sha256: string) {
    void _fileName
    const key = `demo/${invoiceId}/${sha256}`
    await putLocalFile(key, file)
    return key
  }

  loadInvoiceFile(storagePath: string) {
    return getLocalFile(storagePath)
  }

  deleteInvoiceFile(storagePath: string) {
    return deleteLocalFile(storagePath)
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
    const next = { ...this.data, settings: d.settings }
    for (const name of COLLECTIONS) {
      ;(next as unknown as Record<string, { id: string }[]>)[name] = merge(
        this.data[name] as unknown as { id: string }[],
        d[name] as unknown as { id: string }[],
      )
    }
    this.commit(next)
  }

  /** Empties the demo sandbox; default categories are kept so the empty demo stays usable. */
  async deleteAllData() {
    await wait()
    await clearLocalFiles('demo/')
    const now = this.now()
    this.commit({
      transactions: [],
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now, updatedAt: now })),
      budgets: [],
      recurringBills: [],
      accounts: [],
      incomeSources: [],
      invoices: [],
      imports: [],
      goals: [],
      debts: [],
      settings: defaultSettings(undefined, this.data.settings.language),
    })
  }
}
