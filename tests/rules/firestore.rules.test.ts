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

const stamps = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() })

const validTx = () => ({
  type: 'expense',
  description: 'Groceries',
  amountMinor: 4210,
  currency: 'USD',
  categoryId: 'exp-groceries',
  date: '2026-03-15',
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
  ...stamps(),
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
  accountId: null,
  ...stamps(),
})

const validAccount = () => ({
  name: 'Main card',
  kind: 'credit-card',
  provider: 'Bank',
  currency: 'USD',
  openingBalanceMinor: -12000,
  last4: '4242',
  syncMode: 'manual',
  creditLimitMinor: 500000,
  statementDay: 25,
  paymentDueDay: 10,
  minimumPaymentMinor: 2500,
  archived: false,
  notes: '',
  ...stamps(),
})

const validIncomeSource = () => ({
  name: 'Salary',
  categoryId: 'inc-salary',
  description: 'Monthly salary',
  currency: 'USD',
  expectedAmountMinor: 300000,
  frequency: 'monthly',
  nextExpectedDate: '2026-03-01',
  anchorDay: 1,
  endDate: null,
  accountId: null,
  status: 'active',
  notes: '',
  ...stamps(),
})

const validFile = () => ({
  name: 'receipt.jpg',
  type: 'image/jpeg',
  size: 120_000,
  sha256: 'a'.repeat(64),
  storagePath: `users/alice/invoices/inv1/${'a'.repeat(64)}.jpg`,
})

const validInvoice = () => ({
  kind: 'receipt',
  merchant: 'Corner Shop',
  merchantAddress: '',
  merchantTaxId: '',
  invoiceNumber: 'R-1',
  issueDate: '2026-03-15',
  dueDate: null,
  currency: 'USD',
  subtotalMinor: 4000,
  discountMinor: null,
  taxMinor: 210,
  totalMinor: 4210,
  taxLines: [{ label: 'VAT', rate: '5', amountMinor: 210 }],
  lines: [{ description: 'Milk', quantity: '1', unitPriceMinor: 4000, totalMinor: 4000 }],
  categoryId: 'exp-groceries',
  status: 'paid',
  paymentMethod: 'cash',
  warrantyUntil: null,
  returnBy: null,
  qrText: '',
  extraction: 'manual',
  rawText: '',
  linkedTransactionIds: [],
  file: null,
  notes: '',
  ...stamps(),
})

const validImport = () => ({
  fileName: 'statement.csv',
  format: 'csv',
  accountId: 'acc1',
  rowCount: 3,
  importedCount: 2,
  duplicateCount: 1,
  skippedCount: 0,
  status: 'completed',
  ...stamps(),
})

const validGoal = () => ({
  name: 'Emergency fund',
  currency: 'USD',
  targetMinor: 1_000_000,
  targetDate: null,
  isEmergencyFund: true,
  contributions: [{ date: '2026-03-01', amountMinor: 10000, note: '' }],
  notes: '',
  ...stamps(),
})

const validDebt = () => ({
  name: 'Car loan',
  kind: 'loan',
  lender: 'Bank',
  currency: 'USD',
  originalMinor: 2_000_000,
  annualRate: '7.5',
  minimumPaymentMinor: 45000,
  dueDay: 5,
  payments: [],
  notes: '',
  ...stamps(),
})

const validSettings = () => ({
  displayCurrency: 'USD',
  locale: 'en-US',
  language: 'en',
  dateFormat: 'locale',
  weekStartsOn: 1,
  openingBalances: [],
  ...stamps(),
})

const alice = (): Firestore => env.authenticatedContext('alice').firestore() as unknown as Firestore
const bob = (): Firestore => env.authenticatedContext('bob').firestore() as unknown as Firestore
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore

const put = (path: string, data: object) => setDoc(doc(alice(), path), data)

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
    await assertFails(getDocs(collection(anon(), 'users/alice/accounts')))
    await assertFails(setDoc(doc(anon(), 'users/alice/accounts/a1'), validAccount()))
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

  it.each([
    ['accounts', validAccount],
    ['incomeSources', validIncomeSource],
    ['invoices', validInvoice],
    ['imports', validImport],
    ['goals', validGoal],
    ['debts', validDebt],
  ] as const)('isolates %s between users', async (name, make) => {
    await assertSucceeds(put(`users/alice/${name}/x1`, make()))
    await assertSucceeds(getDoc(doc(alice(), `users/alice/${name}/x1`)))
    await assertFails(getDoc(doc(bob(), `users/alice/${name}/x1`)))
    await assertFails(getDocs(collection(bob(), `users/alice/${name}`)))
    await assertFails(setDoc(doc(bob(), `users/alice/${name}/x2`), make()))
    await assertFails(updateDoc(doc(bob(), `users/alice/${name}/x1`), { notes: 'x', updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(bob(), `users/alice/${name}/x1`)))
    await assertSucceeds(deleteDoc(doc(alice(), `users/alice/${name}/x1`)))
  })

  it('denies the parent user document and unknown collections', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { anything: true }))
    await assertFails(getDoc(doc(alice(), 'users/alice')))
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), { a: 1 }))
    await assertFails(getDoc(doc(alice(), 'users/alice/secrets/x')))
    await assertFails(setDoc(doc(alice(), 'public/x'), { a: 1 }))
  })

  it('does not let a record of one collection be stored in another', async () => {
    await assertFails(put('users/alice/accounts/a1', validTx()))
    await assertFails(put('users/alice/transactions/t1', validAccount()))
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
    ['an unknown type', { type: 'adjustment' }],
    ['an empty description', { description: '' }],
    ['an unknown payment method', { paymentMethod: 'crypto' }],
    ['an unknown origin', { origin: 'bank-sync' }],
    ['a non-boolean reconciled flag', { reconciled: 'yes' }],
    ['an invalid account ID', { accountId: 'bad/id' }],
  ])('rejects %s', async (_label, patch) => {
    await assertFails(put('users/alice/transactions/t1', { ...validTx(), ...patch }))
  })

  it('rejects unexpected fields and missing fields', async () => {
    await assertFails(put('users/alice/transactions/t1', { ...validTx(), isAdmin: true }))
    const { notes: _notes, ...missing } = validTx()
    void _notes
    await assertFails(put('users/alice/transactions/t1', missing))
  })

  it('rejects client-chosen timestamps and changes to createdAt', async () => {
    const forged = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'))
    await assertFails(put('users/alice/transactions/t1', { ...validTx(), createdAt: forged }))
    await assertSucceeds(put('users/alice/transactions/t1', validTx()))
    await assertFails(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { createdAt: forged, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amountMinor: 5000 }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/transactions/t1'), { amountMinor: 5000, updatedAt: serverTimestamp() }))
  })

  it('accepts income and refund transactions with an account', async () => {
    await assertSucceeds(put('users/alice/transactions/i1', { ...validTx(), type: 'income', categoryId: 'inc-salary', accountId: 'acc1' }))
    await assertSucceeds(put('users/alice/transactions/r1', { ...validTx(), type: 'refund', accountId: 'acc1', paymentMethod: 'credit-card' }))
  })

  it('links an invoice ID', async () => {
    await assertSucceeds(put('users/alice/transactions/t1', { ...validTx(), invoiceId: 'inv1', origin: 'invoice' }))
    await assertFails(put('users/alice/transactions/t2', { ...validTx(), invoiceId: 'bad id' }))
  })
})

describe('transfers', () => {
  const transfer = () => ({ ...validTx(), type: 'transfer', categoryId: 'transfer', accountId: 'acc1', toAccountId: 'acc2' })

  it('accepts a transfer between two different accounts with the transfer category', async () => {
    await assertSucceeds(put('users/alice/transactions/tr1', transfer()))
  })

  it.each([
    ['to the same account', { toAccountId: 'acc1' }],
    ['with a regular category', { categoryId: 'exp-other' }],
    ['without a source account', { accountId: null }],
    ['without a destination account', { toAccountId: null }],
  ])('rejects a transfer %s', async (_label, patch) => {
    await assertFails(put('users/alice/transactions/tr1', { ...transfer(), ...patch }))
  })

  it('rejects a destination account on non-transfer transactions', async () => {
    await assertFails(put('users/alice/transactions/t1', { ...validTx(), accountId: 'acc1', toAccountId: 'acc2' }))
  })

  it('rejects turning a transfer into a same-account transfer on update', async () => {
    await assertSucceeds(put('users/alice/transactions/tr1', transfer()))
    await assertFails(updateDoc(doc(alice(), 'users/alice/transactions/tr1'), { toAccountId: 'acc1', updatedAt: serverTimestamp() }))
  })
})

describe('recurring bill payments', () => {
  const payment = () => ({ ...validTx(), origin: 'bill', recurringBillId: 'bill1', recurringDueDate: '2026-03-31' })

  it('only accepts the deterministic ID for a bill occurrence', async () => {
    await assertFails(put('users/alice/transactions/random-id', payment()))
    await assertFails(put('users/alice/transactions/bill_bill1_2026-03-31', { ...payment(), type: 'income' }))
    await assertFails(put('users/alice/transactions/bill_bill1_2026-03-31', { ...payment(), recurringDueDate: null }))
    await assertSucceeds(put('users/alice/transactions/bill_bill1_2026-03-31', payment()))
  })

  it('cannot record the same occurrence twice as a new expense', async () => {
    await assertSucceeds(put('users/alice/transactions/bill_bill1_2026-03-31', payment()))
    // A second "create" of the same document is an update with a new createdAt, which is denied.
    await assertFails(put('users/alice/transactions/bill_bill1_2026-03-31', payment()))
  })

  it('validates bill records', async () => {
    await assertSucceeds(put('users/alice/recurringBills/bill1', validBill()))
    await assertSucceeds(put('users/alice/recurringBills/bill4', { ...validBill(), accountId: 'acc1' }))
    await assertFails(put('users/alice/recurringBills/bill2', { ...validBill(), frequency: 'daily' }))
    await assertFails(put('users/alice/recurringBills/bill3', { ...validBill(), anchorDay: 32 }))
    const { accountId: _a, ...v1Bill } = validBill()
    void _a
    await assertFails(put('users/alice/recurringBills/bill5', v1Bill))
  })
})

describe('income receipts', () => {
  const receipt = () => ({
    ...validTx(),
    type: 'income',
    categoryId: 'inc-salary',
    origin: 'income',
    incomeSourceId: 'src1',
    incomeDueDate: '2026-03-01',
  })

  it('accepts the deterministic receipt ID (inc_{sourceId}_{due}_{n})', async () => {
    await assertSucceeds(put('users/alice/transactions/inc_src1_2026-03-01_1', receipt()))
    await assertSucceeds(put('users/alice/transactions/inc_src1_2026-03-01_2', receipt()))
  })

  it.each([
    ['a random ID', 'random-id', {}],
    ['another source in the ID', 'inc_src2_2026-03-01_1', {}],
    ['another due date in the ID', 'inc_src1_2026-04-01_1', {}],
    ['a missing sequence number', 'inc_src1_2026-03-01', {}],
    ['a 4-digit sequence number', 'inc_src1_2026-03-01_1000', {}],
    ['an expense type', 'inc_src1_2026-03-01_1', { type: 'expense' }],
    ['a missing due date', 'inc_src1_2026-03-01_1', { incomeDueDate: null }],
  ])('rejects %s', async (_label, id, patch) => {
    await assertFails(put(`users/alice/transactions/${id}`, { ...receipt(), ...patch }))
  })

  it('cannot record the same receipt twice', async () => {
    await assertSucceeds(put('users/alice/transactions/inc_src1_2026-03-01_1', receipt()))
    await assertFails(put('users/alice/transactions/inc_src1_2026-03-01_1', receipt()))
  })

  it('validates income sources', async () => {
    await assertSucceeds(put('users/alice/incomeSources/src1', validIncomeSource()))
    await assertSucceeds(put('users/alice/incomeSources/src2', { ...validIncomeSource(), frequency: 'once', accountId: 'acc1' }))
    await assertFails(put('users/alice/incomeSources/src3', { ...validIncomeSource(), frequency: 'daily' }))
    await assertFails(put('users/alice/incomeSources/src4', { ...validIncomeSource(), expectedAmountMinor: 0 }))
    await assertFails(put('users/alice/incomeSources/src5', { ...validIncomeSource(), status: 'deleted' }))
    await assertFails(put('users/alice/incomeSources/src6', { ...validIncomeSource(), nextExpectedDate: 'soon' }))
  })
})

describe('imports', () => {
  const imported = () => ({ ...validTx(), origin: 'import', importId: 'batch1', accountId: 'acc1', sourceRef: 'row-7' })

  it('accepts imported rows with an imp_ ID and the batch record', async () => {
    await assertSucceeds(put('users/alice/transactions/imp_acc1_abc123', imported()))
    await assertSucceeds(put('users/alice/transactions/imp_none_abc123', { ...imported(), accountId: null }))
    await assertSucceeds(put('users/alice/imports/batch1', validImport()))
  })

  it('rejects imported rows without a deterministic ID or with a bad batch ID', async () => {
    await assertFails(put('users/alice/transactions/random-id', imported()))
    await assertFails(put('users/alice/transactions/imp_acc1_abc123', { ...imported(), importId: 'bad id' }))
  })

  it('lets a batch be marked rolled back but rejects unknown values', async () => {
    await assertSucceeds(put('users/alice/imports/batch1', validImport()))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/imports/batch1'), { status: 'rolled-back', updatedAt: serverTimestamp() }))
    await assertFails(put('users/alice/imports/batch2', { ...validImport(), format: 'xlsx' }))
    await assertFails(put('users/alice/imports/batch3', { ...validImport(), status: 'pending' }))
    await assertFails(put('users/alice/imports/batch4', { ...validImport(), rowCount: '3' }))
  })
})

describe('accounts', () => {
  it('accepts an account with the last four digits or none', async () => {
    await assertSucceeds(put('users/alice/accounts/a1', validAccount()))
    await assertSucceeds(
      put('users/alice/accounts/a2', {
        ...validAccount(),
        kind: 'cash',
        last4: '',
        openingBalanceMinor: 0,
        creditLimitMinor: null,
        statementDay: null,
        paymentDueDay: null,
        minimumPaymentMinor: null,
      }),
    )
  })

  it.each([
    ['a full card number in last4', { last4: '4111111111111111' }],
    ['three digits in last4', { last4: '123' }],
    ['letters in last4', { last4: '12a4' }],
    ['a numeric last4', { last4: 4242 }],
    ['an unknown kind', { kind: 'crypto' }],
    ['an unknown sync mode', { syncMode: 'open-banking' }],
    ['a fractional opening balance', { openingBalanceMinor: 1.5 }],
    ['a statement day of 32', { statementDay: 32 }],
    ['an empty name', { name: '' }],
  ])('rejects %s', async (_label, patch) => {
    await assertFails(put('users/alice/accounts/a1', { ...validAccount(), ...patch }))
  })

  it('rejects storing a card number in another field', async () => {
    await assertFails(put('users/alice/accounts/a1', { ...validAccount(), cardNumber: '4111111111111111' }))
  })

  it('rejects changing last4 to a full card number on update', async () => {
    await assertSucceeds(put('users/alice/accounts/a1', validAccount()))
    await assertFails(updateDoc(doc(alice(), 'users/alice/accounts/a1'), { last4: '4111111111111111', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/accounts/a1'), { archived: true, updatedAt: serverTimestamp() }))
  })
})

describe('invoices', () => {
  it('accepts an invoice without a file and with file metadata', async () => {
    await assertSucceeds(put('users/alice/invoices/inv1', validInvoice()))
    await assertSucceeds(put('users/alice/invoices/inv2', { ...validInvoice(), file: validFile() }))
    await assertSucceeds(put('users/alice/invoices/inv3', { ...validInvoice(), file: { ...validFile(), type: 'application/pdf', name: 'bill.pdf' } }))
  })

  it.each([
    ['an unknown kind', { kind: 'quote' }],
    ['an unknown status', { status: 'overdue' }],
    ['an unknown extraction method', { extraction: 'ai' }],
    ['a negative total', { totalMinor: -1 }],
    ['an invalid issue date', { issueDate: '15/03/2026' }],
    ['a non-list of lines', { lines: 'Milk' }],
    ['more than 50 linked transactions', { linkedTransactionIds: Array.from({ length: 51 }, (_, i) => `t${i}`) }],
  ])('rejects %s', async (_label, patch) => {
    await assertFails(put('users/alice/invoices/inv1', { ...validInvoice(), ...patch }))
  })

  it.each([
    ['an HTML file type', { type: 'text/html' }],
    ['a file over 10 MB', { size: 10 * 1024 * 1024 + 1 }],
    ['an empty file', { size: 0 }],
    ['a malformed sha256', { sha256: 'xyz' }],
    ['an uppercase sha256', { sha256: 'A'.repeat(64) }],
    ['a public download URL field', { downloadUrl: 'https://example.com/f.jpg' }],
  ])('rejects file metadata with %s', async (_label, patch) => {
    await assertFails(put('users/alice/invoices/inv1', { ...validInvoice(), file: { ...validFile(), ...patch } }))
  })

  it('rejects file metadata with missing fields', async () => {
    const { storagePath: _s, ...partial } = validFile()
    void _s
    await assertFails(put('users/alice/invoices/inv1', { ...validInvoice(), file: partial }))
  })

  it('lets the owner link a transaction and attach a file later', async () => {
    await assertSucceeds(put('users/alice/invoices/inv1', validInvoice()))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/invoices/inv1'), { linkedTransactionIds: ['t1'], updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/invoices/inv1'), { file: validFile(), updatedAt: serverTimestamp() }))
  })
})

describe('goals and debts', () => {
  it('validates savings goals', async () => {
    await assertSucceeds(put('users/alice/goals/g1', validGoal()))
    await assertSucceeds(put('users/alice/goals/g2', { ...validGoal(), isEmergencyFund: false, targetDate: '2027-01-01', contributions: [] }))
    await assertFails(put('users/alice/goals/g3', { ...validGoal(), targetMinor: 0 }))
    await assertFails(put('users/alice/goals/g4', { ...validGoal(), isEmergencyFund: 'yes' }))
    await assertFails(put('users/alice/goals/g5', { ...validGoal(), contributions: 'none' }))
    await assertFails(put('users/alice/goals/g6', { ...validGoal(), targetDate: '2027-02-30x' }))
  })

  it('validates debts', async () => {
    await assertSucceeds(put('users/alice/debts/d1', validDebt()))
    await assertSucceeds(put('users/alice/debts/d2', { ...validDebt(), kind: 'personal', annualRate: '', minimumPaymentMinor: null, dueDay: null }))
    await assertFails(put('users/alice/debts/d3', { ...validDebt(), kind: 'credit' }))
    await assertFails(put('users/alice/debts/d4', { ...validDebt(), originalMinor: 0 }))
    await assertFails(put('users/alice/debts/d5', { ...validDebt(), annualRate: 7.5 }))
    await assertFails(put('users/alice/debts/d6', { ...validDebt(), dueDay: 0 }))
  })
})

describe('budgets, categories and settings', () => {
  it('validates budgets', async () => {
    const budget = {
      name: 'Food',
      categoryId: 'exp-groceries',
      limitMinor: 40000,
      currency: 'USD',
      startMonth: '2026-03',
      endMonth: null,
      notes: '',
      ...stamps(),
    }
    await assertSucceeds(put('users/alice/budgets/b1', budget))
    await assertFails(put('users/alice/budgets/b2', { ...budget, endMonth: '2026-01' }))
    await assertFails(put('users/alice/budgets/b3', { ...budget, limitMinor: 0 }))
  })

  it('validates categories and keeps their type fixed', async () => {
    const category = { name: 'Pets', type: 'expense', color: '#2a78d6', ...stamps() }
    await assertSucceeds(put('users/alice/categories/c1', category))
    await assertFails(put('users/alice/categories/c2', { ...category, color: 'red' }))
    await assertFails(put('users/alice/categories/c3', { ...category, type: 'transfer' }))
    await assertFails(updateDoc(doc(alice(), 'users/alice/categories/c1'), { type: 'income', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/categories/c1'), { name: 'Pet care', updatedAt: serverTimestamp() }))
  })

  it('only allows the single preferences document for settings', async () => {
    await assertSucceeds(put('users/alice/settings/preferences', validSettings()))
    await assertFails(put('users/alice/settings/other', validSettings()))
    await assertFails(updateDoc(doc(alice(), 'users/alice/settings/preferences'), { displayCurrency: 'dollars', updatedAt: serverTimestamp() }))
  })

  it('accepts the Arabic interface language and rejects unsupported ones', async () => {
    await assertSucceeds(put('users/alice/settings/preferences', { ...validSettings(), language: 'ar', locale: 'ar-EG' }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/settings/preferences'), { language: 'en', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(alice(), 'users/alice/settings/preferences'), { language: 'fr', updatedAt: serverTimestamp() }))
    await env.clearFirestore()
    await assertFails(put('users/alice/settings/preferences', { ...validSettings(), language: 'fr' }))
    const { language: _l, ...withoutLanguage } = validSettings()
    void _l
    await assertFails(put('users/alice/settings/preferences', withoutLanguage))
  })

  it('lets only the owner delete settings', async () => {
    await assertSucceeds(put('users/alice/settings/preferences', validSettings()))
    await assertFails(deleteDoc(doc(bob(), 'users/alice/settings/preferences')))
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/settings/preferences')))
  })
})
