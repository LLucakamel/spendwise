/**
 * Security rules tests. They run against the Firestore emulator:
 *   npm run test:rules
 * (requires Java 21+ on PATH; firebase-tools starts and stops the emulator).
 */
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const validTx = () => ({
  type: 'expense',
  description: 'Groceries',
  amountMinor: 4210,
  currency: 'USD',
  categoryId: 'exp-groceries',
  date: '2026-03-15',
  notes: '',
  paymentMethod: null,
  recurringBillId: null,
  recurringDueDate: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

const validBill = () => ({
  name: 'Internet',
  amountMinor: 5999,
  currency: 'USD',
  categoryId: 'exp-utilities',
  frequency: 'monthly',
  nextDueDate: '2026-03-31',
  anchorDay: 31,
  endDate: null,
  notes: '',
  status: 'active',
  lastPaidDate: null,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

const alice = (): Firestore => env.authenticatedContext('alice').firestore() as unknown as Firestore
const bob = (): Firestore => env.authenticatedContext('bob').firestore() as unknown as Firestore
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-spendwise',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

describe('ownership and isolation', () => {
  it('lets a user create and read their own transaction', async () => {
    const ref = doc(alice(), 'users/alice/transactions/t1')
    await assertSucceeds(setDoc(ref, validTx()))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/transactions')))
  })

  it('denies unauthenticated access', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice/transactions/t1')))
    await assertFails(setDoc(doc(anon(), 'users/alice/transactions/t1'), validTx()))
  })

  it('prevents one user from reading, listing, changing or deleting another user’s data', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/t1'), validTx()))
    await assertFails(getDoc(doc(bob(), 'users/alice/transactions/t1')))
    await assertFails(getDocs(collection(bob(), 'users/alice/transactions')))
    await assertFails(updateDoc(doc(bob(), 'users/alice/transactions/t1'), { amountMinor: 1, updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(bob(), 'users/alice/transactions/t1')))
    await assertFails(setDoc(doc(bob(), 'users/alice/transactions/t2'), validTx()))
    await assertFails(getDocs(collection(bob(), 'users/alice/budgets')))
    await assertFails(getDoc(doc(bob(), 'users/alice/settings/preferences')))
  })

  it('denies the parent user document and unknown collections', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { anything: true }))
    await assertFails(getDoc(doc(alice(), 'users/alice')))
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), { a: 1 }))
    await assertFails(setDoc(doc(alice(), 'public/x'), { a: 1 }))
  })
})

describe('transaction validation', () => {
  it.each([
    ['a fractional amount', { amountMinor: 12.5 }],
    ['a negative amount', { amountMinor: -100 }],
    ['a zero amount', { amountMinor: 0 }],
    ['a string amount', { amountMinor: '100' }],
    ['an invalid currency', { currency: 'usd' }],
    ['an invalid date', { date: '2026-13-01' }],
    ['an unknown type', { type: 'transfer' }],
    ['an empty description', { description: '' }],
    ['an unknown payment method', { paymentMethod: 'crypto' }],
  ])('rejects %s', async (_label, patch) => {
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t1'), { ...validTx(), ...patch }))
  })

  it('rejects unexpected fields and missing fields', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t1'), { ...validTx(), isAdmin: true }))
    const { notes: _notes, ...missing } = validTx()
    void _notes
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t1'), missing))
  })

  it('rejects client-chosen timestamps and changes to createdAt', async () => {
    const forged = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'))
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/t1'), { ...validTx(), createdAt: forged }))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/t1'), validTx()))
    await assertFails(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { createdAt: forged, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amountMinor: 5000, updatedAt: serverTimestamp() }))
  })
})

describe('recurring bill payments', () => {
  const payment = () => ({ ...validTx(), recurringBillId: 'bill1', recurringDueDate: '2026-03-31' })

  it('only accepts the deterministic ID for a bill occurrence', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/random-id'), payment()))
    await assertFails(setDoc(doc(alice(), 'users/alice/transactions/bill_bill1_2026-03-31'), { ...payment(), type: 'income' }))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/transactions/bill_bill1_2026-03-31'), payment()))
  })

  it('cannot record the same occurrence twice as a new expense', async () => {
    const ref = doc(alice(), 'users/alice/transactions/bill_bill1_2026-03-31')
    await assertSucceeds(setDoc(ref, payment()))
    // A second "create" of the same document is an update with a new createdAt, which is denied.
    await assertFails(setDoc(ref, payment()))
  })

  it('validates bill records', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/recurringBills/bill1'), validBill()))
    await assertFails(setDoc(doc(alice(), 'users/alice/recurringBills/bill2'), { ...validBill(), frequency: 'daily' }))
    await assertFails(setDoc(doc(alice(), 'users/alice/recurringBills/bill3'), { ...validBill(), anchorDay: 32 }))
  })
})

describe('other collections', () => {
  it('validates budgets', async () => {
    const budget = {
      name: 'Food',
      categoryId: 'exp-groceries',
      limitMinor: 40000,
      currency: 'USD',
      startMonth: '2026-03',
      endMonth: null,
      notes: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/budgets/b1'), budget))
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/b2'), { ...budget, endMonth: '2026-01' }))
    await assertFails(setDoc(doc(alice(), 'users/alice/budgets/b3'), { ...budget, limitMinor: 0 }))
  })

  it('validates categories and keeps their type fixed', async () => {
    const category = { name: 'Pets', type: 'expense', color: '#2a78d6', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/categories/c1'), category))
    await assertFails(setDoc(doc(alice(), 'users/alice/categories/c2'), { ...category, color: 'red' }))
    await assertFails(updateDoc(doc(alice(), 'users/alice/categories/c1'), { type: 'income', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/categories/c1'), { name: 'Pet care', updatedAt: serverTimestamp() }))
  })

  it('only allows the single preferences document for settings', async () => {
    const settings = {
      displayCurrency: 'USD',
      locale: 'en-US',
      dateFormat: 'locale',
      weekStartsOn: 1,
      openingBalances: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/settings/preferences'), settings))
    await assertFails(setDoc(doc(alice(), 'users/alice/settings/other'), settings))
    await assertFails(updateDoc(doc(alice(), 'users/alice/settings/preferences'), { displayCurrency: 'dollars', updatedAt: serverTimestamp() }))
  })
})
