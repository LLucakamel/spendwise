/**
 * Runs the app's real FirestoreRepository against the Auth and Firestore emulators,
 * checking that every write path the UI uses is accepted by firestore.rules and that
 * users stay isolated. Run with `npm run test:rules`.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FirestoreRepository } from '@/data/firebase/firestoreRepository'
import type { FinanceData } from '@/domain/types'
import { createBackup } from '@/lib/backup'
import { DuplicatePaymentError } from '@/lib/recurring'

const PROJECT = 'demo-spendwise'
const apps: FirebaseApp[] = []

async function signedInRepository(name: string) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, name)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`, { disableWarnings: true })
  const db = getFirestore(app)
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  connectFirestoreEmulator(db, host!, Number(port))
  const credential = await createUserWithEmailAndPassword(auth, `${name}-${Date.now()}@example.test`, 'correct-horse-battery')
  return { db, auth, uid: credential.user.uid, repo: new FirestoreRepository(db, credential.user.uid) }
}

/** Resolves with the first snapshot that satisfies `predicate`. */
function waitFor(repo: FirestoreRepository, predicate: (d: FinanceData) => boolean): Promise<FinanceData> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for data')), 15000)
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
  it('initialises a new account with settings and default categories', async () => {
    const data = await waitFor(alice.repo, (d) => d.categories.length > 0)
    expect(data.settings.displayCurrency).toBe('USD')
    expect(data.categories.map((c) => c.id)).toContain('exp-groceries')
    expect(data.transactions).toEqual([])
  })

  it('creates, updates and deletes a transaction', async () => {
    const id = alice.repo.newId()
    const input = {
      type: 'expense' as const,
      description: 'Groceries',
      amountMinor: 4210,
      currency: 'USD',
      categoryId: 'exp-groceries',
      date: '2026-03-15',
      notes: '',
      paymentMethod: 'debit-card' as const,
      recurringBillId: null,
      recurringDueDate: null,
    }
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
    await alice.repo.updateSettings({ displayCurrency: 'EUR', openingBalances: [{ currency: 'EUR', amountMinor: -1500 }] })
    const data = await waitFor(alice.repo, (d) => d.settings.displayCurrency === 'EUR' && d.budgets.length === 1)
    expect(data.categories.find((c) => c.id === 'pets')?.name).toBe('Pet care')
    expect(data.settings.openingBalances).toEqual([{ currency: 'EUR', amountMinor: -1500 }])
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
    })
    const before = await waitFor(alice.repo, (d) => d.recurringBills.some((b) => b.id === 'rent'))
    const bill = before.recurringBills.find((b) => b.id === 'rent')!
    const txId = await alice.repo.recordBillPayment(bill, '2026-01-30')
    expect(txId).toBe('bill_rent_2026-01-31')
    await expect(alice.repo.recordBillPayment(bill, '2026-01-30')).rejects.toBeInstanceOf(DuplicatePaymentError)
    const after = await waitFor(alice.repo, (d) => d.recurringBills.find((b) => b.id === 'rent')?.nextDueDate === '2026-02-28')
    expect(after.transactions.filter((t) => t.recurringBillId === 'rent')).toHaveLength(1)
    await alice.repo.skipBillOccurrence(after.recurringBills.find((b) => b.id === 'rent')!)
    await waitFor(alice.repo, (d) => d.recurringBills.find((b) => b.id === 'rent')?.nextDueDate === '2026-03-31')
  })

  it('restores a backup into the account', async () => {
    const data = await waitFor(alice.repo, () => true)
    const backup = createBackup(data, 'account')
    backup.data.transactions.push({
      id: 'restored1',
      type: 'income',
      description: 'Restored salary',
      amountMinor: 100000,
      currency: 'USD',
      categoryId: 'inc-salary',
      date: '2026-02-01',
      notes: '',
      paymentMethod: null,
      recurringBillId: null,
      recurringDueDate: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    await alice.repo.restoreBackup(backup)
    await waitFor(alice.repo, (d) => d.transactions.some((t) => t.id === 'restored1'))
  })

  it('keeps users isolated: another signed-in user cannot read or write this account', async () => {
    const otherRepo = new FirestoreRepository(bob.db as Firestore, alice.uid)
    await expect(waitFor(otherRepo, () => true)).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(bob.db, 'users', alice.uid, 'settings', 'preferences'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(otherRepo.createTransaction('intrusion', {
      type: 'expense',
      description: 'x',
      amountMinor: 1,
      currency: 'USD',
      categoryId: 'exp-other',
      date: '2026-01-01',
      notes: '',
      paymentMethod: null,
      recurringBillId: null,
      recurringDueDate: null,
    })).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('deletes all of a user’s data', async () => {
    await alice.repo.deleteAllData()
    const settings = await getDoc(doc(alice.db, 'users', alice.uid, 'settings', 'preferences'))
    expect(settings.exists()).toBe(false)
    await signOut(alice.auth)
  })
})
