/**
 * Runs the app's real FirestoreRepository against the Auth, Firestore and Storage emulators,
 * checking that every write path the UI uses is accepted by firestore.rules / storage.rules and
 * that users stay isolated. Run with `npm run test:rules`.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, type Firestore } from 'firebase/firestore'
import { connectStorageEmulator, getMetadata, getStorage, ref as storageRef } from 'firebase/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FirestoreRepository } from '@/data/firebase/firestoreRepository'
import { COLLECTIONS, TRANSACTION_DEFAULTS } from '@/data/repository'
import type { FinanceData, IncomeSource, InvoiceInput, TransactionInput } from '@/domain/types'
import { createBackup } from '@/lib/backup'
import { importTransactionId } from '@/lib/import'
import { incomeReceiptId } from '@/lib/income'
import { DuplicatePaymentError } from '@/lib/recurring'

const PROJECT = 'demo-spendwise'
const BUCKET = `${PROJECT}.appspot.com`
const apps: FirebaseApp[] = []

function hostPort(value: string | undefined, fallback: string): [string, number] {
  const [host, port] = (value ?? fallback).replace(/^https?:\/\//, '').split(':')
  return [host!, Number(port)]
}

async function signedInRepository(name: string) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com`, storageBucket: BUCKET }, name)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080'))
  const storage = getStorage(app)
  connectStorageEmulator(storage, ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9199'))
  const credential = await createUserWithEmailAndPassword(auth, `${name}-${Date.now()}@example.test`, 'correct-horse-battery')
  return { db, auth, storage, uid: credential.user.uid, repo: new FirestoreRepository(db, credential.user.uid, storage) }
}

/** Resolves with the first snapshot that satisfies `predicate`. */
function waitFor(repo: FirestoreRepository, predicate: (d: FinanceData) => boolean): Promise<FinanceData> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for data')), 25000)
    const unsubscribe = repo.subscribe(
      (data) => {
        if (!predicate(data)) return
        clearTimeout(timer)
        queueMicrotask(unsubscribe)
        resolve(data)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const expense = (patch: Partial<TransactionInput> = {}): TransactionInput => ({
  ...TRANSACTION_DEFAULTS,
  type: 'expense',
  description: 'Groceries',
  amountMinor: 4210,
  currency: 'USD',
  categoryId: 'exp-groceries',
  date: '2026-03-15',
  ...patch,
})

const account = (name: string, kind: 'bank' | 'credit-card' = 'bank') => ({
  name,
  kind,
  provider: 'Bank',
  currency: 'USD',
  openingBalanceMinor: 0,
  last4: kind === 'credit-card' ? '4242' : '',
  syncMode: 'manual' as const,
  creditLimitMinor: null,
  statementDay: null,
  paymentDueDay: null,
  minimumPaymentMinor: null,
  archived: false,
  notes: '',
})

const invoice = (): InvoiceInput => ({
  kind: 'receipt',
  merchant: 'Corner Shop',
  merchantAddress: '',
  merchantTaxId: '',
  invoiceNumber: 'R-1',
  issueDate: '2026-03-15',
  dueDate: null,
  currency: 'USD',
  subtotalMinor: null,
  discountMinor: null,
  taxMinor: null,
  totalMinor: 4210,
  taxLines: [],
  lines: [],
  categoryId: 'exp-groceries',
  status: 'paid',
  paymentMethod: null,
  warrantyUntil: null,
  returnBy: null,
  qrText: '',
  extraction: 'manual',
  rawText: '',
  linkedTransactionIds: [],
  file: null,
  notes: '',
})

let alice: Awaited<ReturnType<typeof signedInRepository>>
let bob: Awaited<ReturnType<typeof signedInRepository>>

beforeAll(async () => {
  alice = await signedInRepository('alice')
  bob = await signedInRepository('bob')
})

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)))
})

describe('FirestoreRepository against the emulators', () => {
  it('initialises a new account with settings and default categories only (no financial records)', async () => {
    const data = await waitFor(alice.repo, (d) => d.categories.length > 0)
    expect(data.settings.displayCurrency).toBe('USD')
    expect(['en', 'ar']).toContain(data.settings.language)
    expect(data.categories.map((c) => c.id)).toContain('exp-groceries')
    for (const name of COLLECTIONS) if (name !== 'categories') expect(data[name]).toEqual([])
  })

  it('creates, updates and deletes a transaction', async () => {
    const id = alice.repo.newId()
    const input = expense({ paymentMethod: 'debit-card' })
    await alice.repo.createTransaction(id, input)
    await alice.repo.updateTransaction(id, { ...input, amountMinor: 5000 })
    const data = await waitFor(alice.repo, (d) => d.transactions.some((t) => t.id === id && t.amountMinor === 5000))
    expect(data.transactions.find((t) => t.id === id)?.createdAt).toMatch(/^\d{4}-/)
    await alice.repo.deleteTransaction(id)
    await waitFor(alice.repo, (d) => !d.transactions.some((t) => t.id === id))
  })

  it('saves budgets, categories and settings', async () => {
    await alice.repo.createBudget('b1', {
      name: 'Food',
      categoryId: 'exp-groceries',
      limitMinor: 40000,
      currency: 'USD',
      startMonth: '2026-03',
      endMonth: null,
      notes: '',
    })
    await alice.repo.createCategory('pets', { name: 'Pets', type: 'expense', color: '#2a78d6' })
    await alice.repo.updateCategory('pets', { name: 'Pet care', type: 'expense', color: '#eb6834' })
    await expect(alice.repo.updateCategory('pets', { name: 'Pet care', type: 'income', color: '#eb6834' })).rejects.toMatchObject({ code: 'permission-denied' })
    await alice.repo.updateSettings({ displayCurrency: 'EUR', language: 'ar', openingBalances: [{ currency: 'EUR', amountMinor: -1500 }] })
    const data = await waitFor(alice.repo, (d) => d.settings.displayCurrency === 'EUR' && d.budgets.length === 1)
    expect(data.categories.find((c) => c.id === 'pets')?.name).toBe('Pet care')
    expect(data.settings.language).toBe('ar')
    expect(data.settings.openingBalances).toEqual([{ currency: 'EUR', amountMinor: -1500 }])
  })

  it('creates accounts and a transfer between them', async () => {
    await alice.repo.create('accounts', 'checking', account('Checking'))
    await alice.repo.create('accounts', 'visa', account('Visa', 'credit-card'))
    await alice.repo.createTransaction('tr1', expense({
      type: 'transfer',
      description: 'Card payment',
      categoryId: 'transfer',
      accountId: 'checking',
      toAccountId: 'visa',
    }))
    await expect(alice.repo.createTransaction('tr2', expense({
      type: 'transfer',
      categoryId: 'transfer',
      accountId: 'checking',
      toAccountId: 'checking',
    }))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(alice.repo.create('accounts', 'bad', { ...account('Bad', 'credit-card'), last4: '4111111111111111' })).rejects.toMatchObject({ code: 'permission-denied' })
    const data = await waitFor(alice.repo, (d) => d.transactions.some((t) => t.id === 'tr1') && d.accounts.length === 2)
    expect(data.transactions.find((t) => t.id === 'tr1')).toMatchObject({ type: 'transfer', accountId: 'checking', toAccountId: 'visa' })
  })

  it('records a bill payment once and advances the bill', async () => {
    await alice.repo.createRecurringBill('rent', {
      name: 'Rent',
      amountMinor: 145000,
      currency: 'USD',
      categoryId: 'exp-housing',
      frequency: 'monthly',
      nextDueDate: '2026-01-31',
      anchorDay: 31,
      endDate: null,
      notes: '',
      status: 'active',
      lastPaidDate: null,
      accountId: 'checking',
    })
    const before = await waitFor(alice.repo, (d) => d.recurringBills.some((b) => b.id === 'rent'))
    const bill = before.recurringBills.find((b) => b.id === 'rent')!
    const txId = await alice.repo.recordBillPayment(bill, '2026-01-30')
    expect(txId).toBe('bill_rent_2026-01-31')
    await expect(alice.repo.recordBillPayment(bill, '2026-01-30')).rejects.toBeInstanceOf(DuplicatePaymentError)
    const after = await waitFor(alice.repo, (d) => d.recurringBills.find((b) => b.id === 'rent')?.nextDueDate === '2026-02-28')
    expect(after.transactions.filter((t) => t.recurringBillId === 'rent')).toHaveLength(1)
    expect(after.transactions.find((t) => t.id === txId)?.accountId).toBe('checking')
    await alice.repo.skipBillOccurrence(after.recurringBills.find((b) => b.id === 'rent')!)
    await waitFor(alice.repo, (d) => d.recurringBills.find((b) => b.id === 'rent')?.nextDueDate === '2026-03-31')
  })

  it('records partial and completing income receipts with deterministic IDs', async () => {
    await alice.repo.create('incomeSources', 'salary', {
      name: 'Salary',
      categoryId: 'inc-salary',
      description: '',
      currency: 'USD',
      expectedAmountMinor: 300000,
      frequency: 'monthly',
      nextExpectedDate: '2026-03-01',
      anchorDay: 1,
      endDate: null,
      accountId: 'checking',
      status: 'active',
      notes: '',
    })
    const initial = await waitFor(alice.repo, (d) => d.incomeSources.some((s) => s.id === 'salary'))
    const source = initial.incomeSources.find((s) => s.id === 'salary')!
    const receipt = { date: '2026-03-01', accountId: 'checking', notes: '', sourceRef: null }

    const first = incomeReceiptId('salary', '2026-03-01', 1)
    expect(first).toBe('inc_salary_2026-03-01_1')
    await alice.repo.recordIncomeReceipt(source, { ...receipt, amountMinor: 100000 }, first, false)
    await expect(alice.repo.recordIncomeReceipt(source, { ...receipt, amountMinor: 100000 }, first, false)).rejects.toBeInstanceOf(DuplicatePaymentError)
    const partial = await waitFor(alice.repo, (d) => d.transactions.some((t) => t.id === first))
    const stillDue = partial.incomeSources.find((s) => s.id === 'salary') as IncomeSource
    expect(stillDue.nextExpectedDate).toBe('2026-03-01')

    await alice.repo.recordIncomeReceipt(stillDue, { ...receipt, amountMinor: 200000 }, incomeReceiptId('salary', '2026-03-01', 2), true)
    const done = await waitFor(alice.repo, (d) => d.incomeSources.find((s) => s.id === 'salary')?.nextExpectedDate === '2026-04-01')
    const receipts = done.transactions.filter((t) => t.incomeSourceId === 'salary')
    expect(receipts.map((t) => t.amountMinor).sort()).toEqual([100000, 200000])
    expect(receipts.every((t) => t.type === 'income' && t.origin === 'income' && t.incomeDueDate === '2026-03-01')).toBe(true)
    // A stale source (already advanced) is reported as a duplicate instead of recording twice.
    await expect(alice.repo.recordIncomeReceipt(stillDue, { ...receipt, amountMinor: 1 }, incomeReceiptId('salary', '2026-03-01', 3), true)).rejects.toBeInstanceOf(DuplicatePaymentError)
  })

  it('imports rows idempotently and rolls an import back', async () => {
    const rows = ['row-a', 'row-b'].map((key, i) => ({
      id: importTransactionId('checking', key),
      input: expense({ description: `Imported ${i}`, amountMinor: 1000 + i, origin: 'import', importId: 'batch1', accountId: 'checking', sourceRef: key }),
    }))
    const batch = {
      fileName: 'statement.csv',
      format: 'csv' as const,
      accountId: 'checking',
      rowCount: 2,
      importedCount: 0,
      duplicateCount: 0,
      skippedCount: 0,
      status: 'completed' as const,
    }
    await expect(alice.repo.importTransactions('batch1', batch, rows)).resolves.toEqual({ imported: 2, alreadyPresent: 0 })
    const again = rows.map((r) => ({ ...r, input: { ...r.input, importId: 'batch2' } }))
    await expect(alice.repo.importTransactions('batch2', batch, again)).resolves.toEqual({ imported: 0, alreadyPresent: 2 })
    const imported = await waitFor(alice.repo, (d) => d.imports.length === 2 && d.transactions.filter((t) => t.importId === 'batch1').length === 2)
    expect(imported.imports.find((b) => b.id === 'batch1')?.importedCount).toBe(2)

    await alice.repo.rollbackImport('batch1')
    const rolledBack = await waitFor(alice.repo, (d) => d.imports.find((b) => b.id === 'batch1')?.status === 'rolled-back')
    expect(rolledBack.transactions.filter((t) => t.importId === 'batch1')).toHaveLength(0)
    expect(rolledBack.transactions.some((t) => t.id === 'tr1')).toBe(true)
  })

  it('links and unlinks an invoice and an expense on both records', async () => {
    await alice.repo.create('invoices', 'inv1', invoice())
    await alice.repo.createTransaction('shop1', expense())
    await alice.repo.setInvoiceLink('inv1', 'shop1', true)
    let data = await waitFor(alice.repo, (d) => d.invoices.find((i) => i.id === 'inv1')?.linkedTransactionIds.includes('shop1') === true)
    expect(data.transactions.find((t) => t.id === 'shop1')?.invoiceId).toBe('inv1')

    await alice.repo.setInvoiceLink('inv1', 'shop1', false)
    data = await waitFor(alice.repo, (d) => d.invoices.find((i) => i.id === 'inv1')?.linkedTransactionIds.length === 0)
    expect(data.transactions.find((t) => t.id === 'shop1')?.invoiceId).toBeNull()

    // Deleting a linked expense also removes it from the invoice.
    await alice.repo.setInvoiceLink('inv1', 'shop1', true)
    await alice.repo.deleteTransaction('shop1')
    await waitFor(alice.repo, (d) => d.invoices.find((i) => i.id === 'inv1')?.linkedTransactionIds.length === 0 && !d.transactions.some((t) => t.id === 'shop1'))
    await expect(alice.repo.setInvoiceLink('inv1', 'missing', true)).rejects.toThrow('Record not found.')
  })

  it('stores an invoice file privately in Cloud Storage', async () => {
    const sha = 'ab'.repeat(32)
    const file = new Blob([new Uint8Array(256).fill(1)], { type: 'image/jpeg' })
    const path = await alice.repo.saveInvoiceFile('inv1', file, 'Receipt.JPG', sha)
    expect(path).toBe(`users/${alice.uid}/invoices/inv1/${sha}.jpg`)
    await alice.repo.update('invoices', 'inv1', { file: { name: 'Receipt.JPG', type: 'image/jpeg', size: 256, sha256: sha, storagePath: path } })
    await expect(getMetadata(storageRef(alice.storage, path))).resolves.toMatchObject({ size: 256, contentType: 'image/jpeg' })
    await expect(getMetadata(storageRef(bob.storage, path))).rejects.toMatchObject({ code: 'storage/unauthorized' })
    await expect(bob.repo.loadInvoiceFile(path)).resolves.toBeNull()
  })

  it('restores a backup into the account', async () => {
    const data = await waitFor(alice.repo, () => true)
    const backup = createBackup(data, 'account')
    backup.data.transactions.push({
      ...expense({ type: 'income', description: 'Restored salary', amountMinor: 100000, categoryId: 'inc-salary', date: '2026-02-01' }),
      id: 'restored1',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    await alice.repo.restoreBackup(backup)
    const restored = await waitFor(alice.repo, (d) => d.transactions.some((t) => t.id === 'restored1'))
    // File references are never restored from a backup.
    expect(restored.invoices.find((i) => i.id === 'inv1')?.file).toBeNull()
  })

  it('keeps users isolated: another signed-in user cannot read or write this account', async () => {
    const otherRepo = new FirestoreRepository(bob.db as Firestore, alice.uid)
    await expect(waitFor(otherRepo, () => true)).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(bob.db, 'users', alice.uid, 'settings', 'preferences'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDocs(collection(bob.db, 'users', alice.uid, 'accounts'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(otherRepo.createTransaction('intrusion', expense({ amountMinor: 1, categoryId: 'exp-other' }))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(otherRepo.create('accounts', 'intrusion', account('x'))).rejects.toMatchObject({ code: 'permission-denied' })
    // Bob's own account is unaffected by Alice's data.
    const bobData = await waitFor(bob.repo, (d) => d.categories.length > 0)
    expect(bobData.transactions).toEqual([])
    expect(bobData.accounts).toEqual([])
  })

  it('deletes all of a user’s data, including files', async () => {
    const filePath = `users/${alice.uid}/invoices/inv1/${'ab'.repeat(32)}.jpg`
    await expect(getMetadata(storageRef(alice.storage, filePath))).resolves.toBeTruthy()
    await alice.repo.deleteAllData()
    for (const name of COLLECTIONS) {
      const snapshot = await getDocs(collection(alice.db, 'users', alice.uid, name))
      expect(snapshot.size, name).toBe(0)
    }
    const settings = await getDoc(doc(alice.db, 'users', alice.uid, 'settings', 'preferences'))
    expect(settings.exists()).toBe(false)
    await expect(getMetadata(storageRef(alice.storage, filePath))).rejects.toMatchObject({ code: 'storage/object-not-found' })
    // Bob's data is untouched.
    const bobSettings = await getDoc(doc(bob.db, 'users', bob.uid, 'settings', 'preferences'))
    expect(bobSettings.exists()).toBe(true)
    await signOut(alice.auth)
    await signOut(bob.auth)
  })
})
