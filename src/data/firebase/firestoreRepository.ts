import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { z } from 'zod'
import type { DataRepository, Unsubscribe } from '@/data/repository'
import { DEFAULT_CATEGORIES, defaultSettings } from '@/domain/defaults'
import {
  budgetRecordSchema,
  categoryRecordSchema,
  recurringBillRecordSchema,
  settingsSchema,
  transactionRecordSchema,
} from '@/domain/schemas'
import type {
  Budget,
  BudgetInput,
  Category,
  CategoryInput,
  FinanceData,
  IsoDate,
  RecurringBill,
  RecurringBillInput,
  Settings,
  Transaction,
  TransactionInput,
} from '@/domain/types'
import type { Backup } from '@/lib/backup'
import { billAfterOccurrence, billPaymentTransactionId, DuplicatePaymentError } from '@/lib/recurring'

/**
 * Firestore layout (all private to the signed-in user, enforced by firestore.rules):
 *   users/{uid}/settings/preferences
 *   users/{uid}/categories/{categoryId}
 *   users/{uid}/transactions/{transactionId}
 *   users/{uid}/budgets/{budgetId}
 *   users/{uid}/recurringBills/{billId}
 */
export const COLLECTIONS = ['categories', 'transactions', 'budgets', 'recurringBills'] as const
type CollectionName = (typeof COLLECTIONS)[number]

const BATCH_LIMIT = 400

/**
 * Safety bound for the live transactions query (newest first). Personal histories are usually far
 * smaller; if it is reached the UI says that the oldest records are not loaded.
 */
export const TRANSACTION_QUERY_LIMIT = 5000

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string') return value
  return new Date().toISOString()
}

function readRecord<T>(snapshot: QueryDocumentSnapshot<DocumentData>, schema: z.ZodType<T>, collectionName: string): T | null {
  const raw = snapshot.data({ serverTimestamps: 'estimate' })
  const candidate = { ...raw, id: snapshot.id, createdAt: toIso(raw.createdAt), updatedAt: toIso(raw.updatedAt) }
  const result = schema.safeParse(candidate)
  if (!result.success) {
    // Only the location is logged, never the record's contents.
    console.warn(`Skipping malformed ${collectionName} record ${snapshot.id}.`)
    return null
  }
  return result.data
}

function readSettings(snapshot: DocumentSnapshot<DocumentData>): Settings | null {
  if (!snapshot.exists()) return null
  const result = settingsSchema.safeParse(snapshot.data())
  return result.success ? result.data : { ...defaultSettings(), ...pickValidSettings(snapshot.data()) }
}

function pickValidSettings(data: DocumentData): Partial<Settings> {
  const partial: Partial<Settings> = {}
  const shape = settingsSchema.shape
  for (const key of Object.keys(shape) as (keyof Settings)[]) {
    const parsed = shape[key].safeParse(data[key])
    if (parsed.success) Object.assign(partial, { [key]: parsed.data })
  }
  return partial
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export class FirestoreRepository implements DataRepository {
  readonly kind = 'firebase' as const
  private initializing: Promise<void> | null = null
  private deleting = false

  private readonly db: Firestore
  private readonly uid: string

  constructor(db: Firestore, uid: string) {
    this.db = db
    this.uid = uid
  }

  private col(name: CollectionName) {
    return collection(this.db, 'users', this.uid, name)
  }

  private ref(name: CollectionName, id: string) {
    return doc(this.db, 'users', this.uid, name, id)
  }

  private settingsRef() {
    return doc(this.db, 'users', this.uid, 'settings', 'preferences')
  }

  newId(): string {
    return doc(this.col('transactions')).id
  }

  subscribe(onData: (data: FinanceData) => void, onError: (error: unknown) => void): Unsubscribe {
    const state: {
      categories?: Category[]
      transactions?: Transaction[]
      budgets?: Budget[]
      recurringBills?: RecurringBill[]
      settings?: Settings | null
      limitReached?: boolean
    } = {}

    const emit = () => {
      const { categories, transactions, budgets, recurringBills, settings } = state
      if (!categories || !transactions || !budgets || !recurringBills || settings === undefined) return
      if (settings === null) {
        // First sign-in: create default settings and categories, then wait for the next snapshot.
        if (!this.deleting) this.initializeAccount().catch(onError)
        return
      }
      transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      onData({ categories, transactions, budgets, recurringBills, settings, transactionLimitReached: state.limitReached === true })
    }

    const listen = <T>(name: CollectionName, schema: z.ZodType<T>, assign: (records: T[], total: number) => void) =>
      onSnapshot(
        name === 'transactions' ? query(this.col(name), orderBy('date', 'desc'), limit(TRANSACTION_QUERY_LIMIT)) : this.col(name),
        (snapshot) => {
          assign(snapshot.docs.map((d) => readRecord(d, schema, name)).filter((r): r is T => r !== null), snapshot.size)
          emit()
        },
        onError,
      )

    const unsubscribers = [
      listen('categories', categoryRecordSchema, (r) => (state.categories = r)),
      listen('transactions', transactionRecordSchema, (r, total) => {
        state.transactions = r
        state.limitReached = total >= TRANSACTION_QUERY_LIMIT
      }),
      listen('budgets', budgetRecordSchema, (r) => (state.budgets = r)),
      listen('recurringBills', recurringBillRecordSchema, (r) => (state.recurringBills = r)),
      onSnapshot(
        this.settingsRef(),
        (snapshot) => {
          state.settings = readSettings(snapshot)
          emit()
        },
        onError,
      ),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }

  /** Creates the settings document and default categories exactly once per account. */
  private initializeAccount(): Promise<void> {
    if (this.initializing) return this.initializing
    this.initializing = runTransaction(this.db, async (tx) => {
      const settingsSnap = await tx.get(this.settingsRef())
      if (settingsSnap.exists()) return
      const existing = await Promise.all(DEFAULT_CATEGORIES.map((c) => tx.get(this.ref('categories', c.id))))
      tx.set(this.settingsRef(), { ...defaultSettings(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      DEFAULT_CATEGORIES.forEach((c, index) => {
        if (existing[index]?.exists()) return
        const { id, ...input } = c
        tx.set(this.ref('categories', id), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      })
    }).finally(() => {
      this.initializing = null
    })
    return this.initializing
  }

  private create(name: CollectionName, id: string, input: object) {
    return setDoc(this.ref(name, id), {
      ...withoutUndefined(input),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  private update(name: CollectionName, id: string, input: object) {
    return updateDoc(this.ref(name, id), { ...withoutUndefined(input), updatedAt: serverTimestamp() })
  }

  createTransaction(id: string, input: TransactionInput) {
    return this.create('transactions', id, input)
  }
  updateTransaction(id: string, input: TransactionInput) {
    return this.update('transactions', id, input)
  }
  deleteTransaction(id: string) {
    return deleteDoc(this.ref('transactions', id))
  }

  createCategory(id: string, input: CategoryInput) {
    return this.create('categories', id, input)
  }
  updateCategory(id: string, input: CategoryInput) {
    return this.update('categories', id, input)
  }
  deleteCategory(id: string) {
    return deleteDoc(this.ref('categories', id))
  }

  createBudget(id: string, input: BudgetInput) {
    return this.create('budgets', id, input)
  }
  updateBudget(id: string, input: BudgetInput) {
    return this.update('budgets', id, input)
  }
  deleteBudget(id: string) {
    return deleteDoc(this.ref('budgets', id))
  }

  createRecurringBill(id: string, input: RecurringBillInput) {
    return this.create('recurringBills', id, input)
  }
  updateRecurringBill(id: string, input: Partial<RecurringBillInput>) {
    return this.update('recurringBills', id, input)
  }
  deleteRecurringBill(id: string) {
    return deleteDoc(this.ref('recurringBills', id))
  }

  /**
   * Runs as a Firestore transaction so the duplicate check, the new expense and the bill
   * update succeed or fail together. The expense ID is derived from the bill and due date,
   * and the security rules only allow creating it once.
   */
  async recordBillPayment(bill: RecurringBill, paymentDate: IsoDate): Promise<string> {
    const transactionId = billPaymentTransactionId(bill.id, bill.nextDueDate)
    await runTransaction(this.db, async (tx) => {
      const billRef = this.ref('recurringBills', bill.id)
      const paymentRef = this.ref('transactions', transactionId)
      const [billSnap, paymentSnap] = await Promise.all([tx.get(billRef), tx.get(paymentRef)])
      if (!billSnap.exists()) throw new Error('This bill no longer exists.')
      const current = billSnap.data() as Omit<RecurringBill, 'id'>
      if (paymentSnap.exists() || current.nextDueDate !== bill.nextDueDate) {
        throw new DuplicatePaymentError(bill.nextDueDate)
      }
      const after = billAfterOccurrence({ ...current }, paymentDate)
      tx.set(paymentRef, {
        type: 'expense',
        description: current.name,
        amountMinor: current.amountMinor,
        currency: current.currency,
        categoryId: current.categoryId,
        date: paymentDate,
        notes: `Payment for the bill due ${current.nextDueDate}.`,
        paymentMethod: null,
        recurringBillId: bill.id,
        recurringDueDate: current.nextDueDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      tx.update(billRef, { ...after, updatedAt: serverTimestamp() })
    })
    return transactionId
  }

  async skipBillOccurrence(bill: RecurringBill) {
    await runTransaction(this.db, async (tx) => {
      const billRef = this.ref('recurringBills', bill.id)
      const snap = await tx.get(billRef)
      if (!snap.exists()) throw new Error('This bill no longer exists.')
      const current = snap.data() as Omit<RecurringBill, 'id'>
      if (current.nextDueDate !== bill.nextDueDate) return
      tx.update(billRef, { ...billAfterOccurrence(current, null), updatedAt: serverTimestamp() })
    })
  }

  updateSettings(patch: Partial<Settings>) {
    return updateDoc(this.settingsRef(), { ...withoutUndefined(patch), updatedAt: serverTimestamp() })
  }

  async restoreBackup(backup: Backup) {
    const existing = new Map<CollectionName, Set<string>>()
    for (const name of COLLECTIONS) {
      const snapshot = await getDocs(this.col(name))
      existing.set(name, new Set(snapshot.docs.map((d) => d.id)))
    }
    const ops: { name: CollectionName; id: string; data: object }[] = []
    const queue = <T extends { id: string; createdAt: string; updatedAt: string }>(name: CollectionName, records: T[]) => {
      for (const record of records) {
        const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = record
        void _createdAt
        void _updatedAt
        ops.push({ name, id, data })
      }
    }
    const d = backup.data
    queue('categories', d.categories)
    queue('transactions', d.transactions)
    queue('budgets', d.budgets)
    queue('recurringBills', d.recurringBills)

    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.db)
      for (const op of ops.slice(i, i + BATCH_LIMIT)) {
        const ref = this.ref(op.name, op.id)
        if (existing.get(op.name)?.has(op.id)) batch.update(ref, { ...op.data, updatedAt: serverTimestamp() })
        else batch.set(ref, { ...op.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }
      await batch.commit()
    }
    await this.updateSettings(d.settings)
  }

  async deleteAllData() {
    this.deleting = true
    for (const name of COLLECTIONS) {
      const snapshot = await getDocs(this.col(name))
      for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(this.db)
        for (const d of snapshot.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref)
        await batch.commit()
      }
    }
    await deleteDoc(this.settingsRef())
  }
}
