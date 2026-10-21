import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { deleteObject, getBlob, listAll, ref as storageRef, uploadBytes, type FirebaseStorage, type StorageReference } from 'firebase/storage'
import type { z } from 'zod'
import {
  BaseRepository,
  COLLECTIONS,
  type CollectionInputs,
  type CollectionName,
  type DataRepository,
  type ImportRowInput,
  type IncomeReceipt,
  type Unsubscribe,
} from '@/data/repository'
import { DEFAULT_CATEGORIES, defaultSettings, detectLanguage } from '@/domain/defaults'
import {
  accountRecordSchema,
  budgetRecordSchema,
  categoryRecordSchema,
  debtRecordSchema,
  goalRecordSchema,
  importBatchRecordSchema,
  incomeSourceRecordSchema,
  invoiceRecordSchema,
  recurringBillRecordSchema,
  settingsSchema,
  transactionRecordSchema,
} from '@/domain/schemas'
import type { FinanceData, ImportBatchInput, IncomeSource, IsoDate, RecurringBill, Settings } from '@/domain/types'
import type { Backup } from '@/lib/backup'
import { clearLocalFiles, deleteLocalFile, getLocalFile, putLocalFile } from '@/data/localFiles'
import { sourceAfterReceipt } from '@/lib/income'
import { billAfterOccurrence, billPaymentTransactionId, DuplicatePaymentError } from '@/lib/recurring'

/**
 * Firestore layout (all private to the signed-in user, enforced by firestore.rules):
 *   users/{uid}/settings/preferences
 *   users/{uid}/{categories|transactions|budgets|recurringBills|accounts|incomeSources|invoices|imports|goals|debts}/{id}
 * Invoice files live in Cloud Storage under users/{uid}/invoices/{invoiceId}/… (storage.rules).
 */

const SCHEMAS: Record<CollectionName, z.ZodType> = {
  categories: categoryRecordSchema,
  transactions: transactionRecordSchema,
  budgets: budgetRecordSchema,
  recurringBills: recurringBillRecordSchema,
  accounts: accountRecordSchema,
  incomeSources: incomeSourceRecordSchema,
  invoices: invoiceRecordSchema,
  imports: importBatchRecordSchema,
  goals: goalRecordSchema,
  debts: debtRecordSchema,
}

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

function readRecord(snapshot: QueryDocumentSnapshot<DocumentData>, schema: z.ZodType, collectionName: string): unknown {
  const raw = snapshot.data({ serverTimestamps: 'estimate' })
  const result = schema.safeParse({ ...raw, id: snapshot.id, createdAt: toIso(raw.createdAt), updatedAt: toIso(raw.updatedAt) })
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
  if (result.success) return result.data
  const partial: Partial<Settings> = {}
  const shape = settingsSchema.shape
  for (const key of Object.keys(shape) as (keyof Settings)[]) {
    const parsed = shape[key].safeParse(snapshot.data()[key])
    if (parsed.success) Object.assign(partial, { [key]: parsed.data })
  }
  return { ...defaultSettings(), ...partial }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export class FirestoreRepository extends BaseRepository implements DataRepository {
  readonly kind = 'firebase' as const
  private initializing: Promise<void> | null = null
  private deleting = false
  private readonly db: Firestore
  private readonly storage: FirebaseStorage | null
  private readonly uid: string

  constructor(db: Firestore, uid: string, storage: FirebaseStorage | null = null) {
    super()
    this.db = db
    this.uid = uid
    this.storage = storage
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
    const state: Partial<Record<CollectionName, unknown[]>> & { settings?: Settings | null; limitReached?: boolean } = {}

    const emit = () => {
      if (COLLECTIONS.some((name) => !state[name]) || state.settings === undefined) return
      if (state.settings === null) {
        // First sign-in: create settings and the default categories (no financial records), then wait for the next snapshot.
        if (!this.deleting) this.initializeAccount().catch(onError)
        return
      }
      const data = Object.fromEntries(COLLECTIONS.map((name) => [name, state[name]])) as unknown as Omit<FinanceData, 'settings'>
      data.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      onData({ ...data, settings: state.settings, transactionLimitReached: state.limitReached === true })
    }

    const unsubscribers = COLLECTIONS.map((name) =>
      onSnapshot(
        name === 'transactions' ? query(this.col(name), orderBy('date', 'desc'), limit(TRANSACTION_QUERY_LIMIT)) : this.col(name),
        (snapshot) => {
          state[name] = snapshot.docs.map((d) => readRecord(d, SCHEMAS[name], name)).filter((r) => r !== null)
          if (name === 'transactions') state.limitReached = snapshot.size >= TRANSACTION_QUERY_LIMIT
          emit()
        },
        onError,
      ),
    )
    unsubscribers.push(
      onSnapshot(
        this.settingsRef(),
        (snapshot) => {
          state.settings = readSettings(snapshot)
          emit()
        },
        onError,
      ),
    )
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }

  /** Creates the settings document and default categories exactly once per account. No financial records are seeded. */
  private initializeAccount(): Promise<void> {
    if (this.initializing) return this.initializing
    this.initializing = runTransaction(this.db, async (tx) => {
      const settingsSnap = await tx.get(this.settingsRef())
      if (settingsSnap.exists()) return
      const existing = await Promise.all(DEFAULT_CATEGORIES.map((c) => tx.get(this.ref('categories', c.id))))
      tx.set(this.settingsRef(), { ...defaultSettings(undefined, detectLanguage()), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
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

  create<K extends CollectionName>(name: K, id: string, input: CollectionInputs[K]) {
    return setDoc(this.ref(name, id), { ...withoutUndefined(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }

  update<K extends CollectionName>(name: K, id: string, patch: Partial<CollectionInputs[K]>) {
    return updateDoc(this.ref(name, id), { ...withoutUndefined(patch), updatedAt: serverTimestamp() })
  }

  async remove(name: CollectionName, id: string) {
    if (name === 'transactions') {
      // Keep invoice links consistent.
      await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(this.ref('transactions', id))
        const invoiceId = snap.exists() ? (snap.data().invoiceId as string | null | undefined) : null
        if (invoiceId) {
          const inv = await tx.get(this.ref('invoices', invoiceId))
          if (inv.exists()) tx.update(inv.ref, { linkedTransactionIds: arrayRemove(id), updatedAt: serverTimestamp() })
        }
        tx.delete(this.ref('transactions', id))
      })
      return
    }
    if (name === 'invoices') {
      await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(this.ref('invoices', id))
        const linked = snap.exists() ? ((snap.data().linkedTransactionIds as string[] | undefined) ?? []) : []
        const txs = await Promise.all(linked.map((t) => tx.get(this.ref('transactions', t))))
        for (const t of txs) if (t.exists()) tx.update(t.ref, { invoiceId: null, updatedAt: serverTimestamp() })
        tx.delete(this.ref('invoices', id))
      })
      return
    }
    await deleteDoc(this.ref(name, id))
  }

  /**
   * Runs as a Firestore transaction so the duplicate check, the new expense and the bill update
   * succeed or fail together. The expense ID is derived from the bill and due date, and the security
   * rules only allow creating it once.
   */
  async recordBillPayment(bill: RecurringBill, paymentDate: IsoDate, accountId?: string | null): Promise<string> {
    const transactionId = billPaymentTransactionId(bill.id, bill.nextDueDate)
    await runTransaction(this.db, async (tx) => {
      const billRef = this.ref('recurringBills', bill.id)
      const paymentRef = this.ref('transactions', transactionId)
      const [billSnap, paymentSnap] = await Promise.all([tx.get(billRef), tx.get(paymentRef)])
      if (!billSnap.exists()) throw new Error('This bill no longer exists.')
      const current = billSnap.data() as Omit<RecurringBill, 'id'>
      if (paymentSnap.exists() || current.nextDueDate !== bill.nextDueDate) throw new DuplicatePaymentError(bill.nextDueDate)
      tx.set(paymentRef, {
        type: 'expense',
        description: current.name,
        amountMinor: current.amountMinor,
        currency: current.currency,
        categoryId: current.categoryId,
        date: paymentDate,
        notes: `Payment for the bill due ${current.nextDueDate}.`,
        paymentMethod: null,
        accountId: accountId === undefined ? (current.accountId ?? null) : accountId,
        toAccountId: null,
        origin: 'bill',
        sourceRef: null,
        importId: null,
        recurringBillId: bill.id,
        recurringDueDate: current.nextDueDate,
        incomeSourceId: null,
        incomeDueDate: null,
        invoiceId: null,
        reconciled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      tx.update(billRef, { ...billAfterOccurrence(current, paymentDate), updatedAt: serverTimestamp() })
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

  async recordIncomeReceipt(source: IncomeSource, receipt: IncomeReceipt, receiptId: string, completesOccurrence: boolean) {
    await runTransaction(this.db, async (tx) => {
      const sourceRef = this.ref('incomeSources', source.id)
      const receiptRef = this.ref('transactions', receiptId)
      const [sourceSnap, receiptSnap] = await Promise.all([tx.get(sourceRef), tx.get(receiptRef)])
      if (!sourceSnap.exists()) throw new Error('This income source no longer exists.')
      const current = sourceSnap.data() as Omit<IncomeSource, 'id'>
      if (receiptSnap.exists() || current.nextExpectedDate !== source.nextExpectedDate) throw new DuplicatePaymentError(source.nextExpectedDate)
      tx.set(receiptRef, {
        type: 'income',
        description: current.name,
        amountMinor: receipt.amountMinor,
        currency: current.currency,
        categoryId: current.categoryId,
        date: receipt.date,
        notes: receipt.notes,
        paymentMethod: null,
        accountId: receipt.accountId,
        toAccountId: null,
        origin: 'income',
        sourceRef: receipt.sourceRef,
        importId: null,
        recurringBillId: null,
        recurringDueDate: null,
        incomeSourceId: source.id,
        incomeDueDate: current.nextExpectedDate,
        invoiceId: null,
        reconciled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      tx.update(sourceRef, { ...sourceAfterReceipt(current, completesOccurrence), updatedAt: serverTimestamp() })
    })
  }

  async skipIncomeOccurrence(source: IncomeSource) {
    await runTransaction(this.db, async (tx) => {
      const sourceRef = this.ref('incomeSources', source.id)
      const snap = await tx.get(sourceRef)
      if (!snap.exists()) return
      const current = snap.data() as Omit<IncomeSource, 'id'>
      if (current.nextExpectedDate !== source.nextExpectedDate) return
      tx.update(sourceRef, { ...sourceAfterReceipt(current, true), updatedAt: serverTimestamp() })
    })
  }

  async importTransactions(batchId: string, batch: ImportBatchInput, rows: ImportRowInput[]) {
    // Find rows that already exist so a re-import never overwrites or duplicates them.
    const existing = new Set<string>()
    for (let i = 0; i < rows.length; i += 30) {
      const ids = rows.slice(i, i + 30).map((r) => r.id)
      const snap = await getDocs(query(this.col('transactions'), where(documentId(), 'in', ids)))
      snap.docs.forEach((d) => existing.add(d.id))
    }
    const fresh = rows.filter((r) => !existing.has(r.id))
    for (let i = 0; i < fresh.length; i += BATCH_LIMIT) {
      const wb = writeBatch(this.db)
      for (const row of fresh.slice(i, i + BATCH_LIMIT)) {
        wb.set(this.ref('transactions', row.id), { ...withoutUndefined(row.input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }
      await wb.commit()
    }
    await setDoc(this.ref('imports', batchId), { ...batch, importedCount: fresh.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    return { imported: fresh.length, alreadyPresent: rows.length - fresh.length }
  }

  async rollbackImport(batchId: string) {
    const snap = await getDocs(query(this.col('transactions'), where('importId', '==', batchId)))
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const wb = writeBatch(this.db)
      for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) wb.delete(d.ref)
      await wb.commit()
    }
    await updateDoc(this.ref('imports', batchId), { status: 'rolled-back', updatedAt: serverTimestamp() })
  }

  async setInvoiceLink(invoiceId: string, transactionId: string, linked: boolean) {
    await runTransaction(this.db, async (tx) => {
      const invRef = this.ref('invoices', invoiceId)
      const txRef = this.ref('transactions', transactionId)
      const [inv, t] = await Promise.all([tx.get(invRef), tx.get(txRef)])
      if (!inv.exists() || !t.exists()) throw new Error('Record not found.')
      tx.update(invRef, { linkedTransactionIds: linked ? arrayUnion(transactionId) : arrayRemove(transactionId), updatedAt: serverTimestamp() })
      tx.update(txRef, { invoiceId: linked ? invoiceId : null, updatedAt: serverTimestamp() })
    })
  }

  /** True when invoice files go to Cloud Storage; otherwise they stay on this device. */
  get cloudFiles(): boolean {
    return this.storage !== null
  }

  private fileRef(path: string): StorageReference {
    if (!this.storage) throw Object.assign(new Error('File storage is not configured.'), { code: 'storage/unavailable' })
    if (!path.startsWith(`users/${this.uid}/`)) throw new Error('Invalid file path.')
    return storageRef(this.storage, path)
  }

  async saveInvoiceFile(invoiceId: string, file: Blob, fileName: string, sha256: string) {
    if (!this.storage) {
      const key = `device/${this.uid}/${invoiceId}/${sha256}`
      await putLocalFile(key, file)
      return key
    }
    const extension = (/\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1] ?? 'bin').toLowerCase()
    const path = `users/${this.uid}/invoices/${invoiceId}/${sha256}.${extension}`
    await uploadBytes(this.fileRef(path), file, { contentType: file.type, cacheControl: 'private, max-age=0' })
    return path
  }

  async loadInvoiceFile(storagePath: string) {
    if (storagePath.startsWith('device/')) return storagePath.startsWith(`device/${this.uid}/`) ? getLocalFile(storagePath) : null
    try {
      return await getBlob(this.fileRef(storagePath))
    } catch {
      return null
    }
  }

  async deleteInvoiceFile(storagePath: string) {
    if (storagePath.startsWith('device/')) return deleteLocalFile(storagePath)
    await deleteObject(this.fileRef(storagePath)).catch(() => undefined)
  }

  updateSettings(patch: Partial<Settings>) {
    return updateDoc(this.settingsRef(), { ...withoutUndefined(patch), updatedAt: serverTimestamp() })
  }

  async restoreBackup(backup: Backup) {
    const ops: { name: CollectionName; id: string; data: object; exists: boolean }[] = []
    for (const name of COLLECTIONS) {
      const snapshot = await getDocs(this.col(name))
      const existing = new Set(snapshot.docs.map((d) => d.id))
      for (const record of backup.data[name] as unknown as { id: string; createdAt: string; updatedAt: string }[]) {
        const { id, createdAt: _c, updatedAt: _u, ...data } = record
        void _c
        void _u
        // Files are not part of backups; keep the metadata but never a storage path from elsewhere.
        if (name === 'invoices') (data as { file: unknown }).file = null
        ops.push({ name, id, data, exists: existing.has(id) })
      }
    }
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.db)
      for (const op of ops.slice(i, i + BATCH_LIMIT)) {
        const ref = this.ref(op.name, op.id)
        if (op.exists) batch.update(ref, { ...op.data, updatedAt: serverTimestamp() })
        else batch.set(ref, { ...op.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }
      await batch.commit()
    }
    await this.updateSettings(backup.data.settings)
  }

  async deleteAllData() {
    this.deleting = true
    await clearLocalFiles(`device/${this.uid}/`)
    if (this.storage) {
      const removeAll = async (folder: StorageReference): Promise<void> => {
        const listing = await listAll(folder)
        await Promise.all(listing.items.map((item) => deleteObject(item)))
        await Promise.all(listing.prefixes.map(removeAll))
      }
      await removeAll(storageRef(this.storage, `users/${this.uid}`)).catch(() => undefined)
    }
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
