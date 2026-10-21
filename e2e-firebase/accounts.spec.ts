import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Account flows against the Firebase Auth, Firestore and Storage emulators (see
 * playwright.emulator.config.ts). Strings come from src/i18n/en.ts; routes are hash-based.
 */

const PASSWORD = 'goodpass1'
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`

/** Parses a formatted en-US amount such as "$1,234.56" or "−$12.00" into minor units. */
function cents(text: string | null): number {
  if (!text) throw new Error('No amount text')
  const negative = /^[−-]/.test(text.trim())
  const [whole = '0', fraction = ''] = text.replace(/[^0-9.]/g, '').split('.')
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -value : value
}

/** The "Recorded balance" amount on an account card on the Accounts page. */
function accountBalance(page: Page, name: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: name }).locator('p').filter({ hasText: 'Recorded balance' }).locator('bdi')
}

async function registerAccount(page: Page, name: string, email: string) {
  await page.goto('./#/register')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/#\/app$/)
  await expect(page.getByText(`Welcome to SpendWise, ${name.split(' ')[0]}`)).toBeVisible({ timeout: 20_000 })
}

async function signOutViaSettings(page: Page) {
  await page.goto('./#/app/settings')
  await page.getByTestId('sign-out').click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/#\/login/)
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function addAccount(page: Page, name: string, openingBalance: string) {
  await page.goto('./#/app/accounts')
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts and cards' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('main').getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('New account')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Opening balance').fill(openingBalance)
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Account added').first()).toBeVisible()
}

async function addExpense(page: Page, description: string, amount: string, account: string) {
  await page.goto('./#/app/transactions')
  await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Description').fill(description)
  await dialog.getByLabel('Amount', { exact: true }).fill(amount)
  await dialog.getByLabel('Account', { exact: true }).selectOption({ label: account })
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Transaction added').first()).toBeVisible()
}

test('registers into an empty account, adds an account and a transaction, signs out and back in', async ({ page }) => {
  const email = uniqueEmail('alice')
  await registerAccount(page, 'Alice Example', email)

  // A new account starts empty: onboarding only, no demo data.
  await expect(page.getByText('Demo mode', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add expense' })).toBeVisible()
  await page.goto('./#/app/transactions')
  await expect(page.getByText('No transactions yet')).toBeVisible({ timeout: 20_000 })
  await page.goto('./#/app/accounts')
  await expect(page.getByText('No accounts yet')).toBeVisible({ timeout: 20_000 })

  await addAccount(page, 'Cloud Checking', '1000')
  await expect.poll(async () => cents(await accountBalance(page, 'Cloud Checking').textContent())).toBe(100000)

  await addExpense(page, 'Cloud test expense', '12.34', 'Cloud Checking · USD')
  await expect(page.getByRole('main').getByText('Cloud test expense').first()).toBeVisible()

  // The account balance reflects the expense.
  await page.goto('./#/app/accounts')
  await expect.poll(async () => cents(await accountBalance(page, 'Cloud Checking').textContent())).toBe(100000 - 1234)

  // Dashboard now shows the recorded expense.
  await page.goto('./#/app')
  await expect(page.getByText('Expenses · USD')).toBeVisible({ timeout: 20_000 })

  // Session survives a reload (Firebase local persistence).
  await page.reload()
  await expect(page.getByText('Expenses · USD')).toBeVisible({ timeout: 20_000 })

  await signOutViaSettings(page)

  // Private routes redirect to sign-in.
  await page.goto('./#/app/accounts')
  await expect(page).toHaveURL(/#\/login/)

  // Wrong password is rejected with a generic message.
  await signIn(page, email, 'wrongpass1')
  await expect(page.getByRole('alert')).toContainText('The email or password is incorrect.')

  // Correct password returns to the requested page, with the stored data.
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/app\/accounts/)
  await expect.poll(async () => cents(await accountBalance(page, 'Cloud Checking').textContent()), { timeout: 20_000 }).toBe(100000 - 1234)
  await page.goto('./#/app/transactions')
  await expect(page.getByText('Cloud test expense').first()).toBeVisible({ timeout: 20_000 })
})

test('a second account cannot see the first account’s accounts or records', async ({ page }) => {
  const ownerEmail = uniqueEmail('owner')
  await registerAccount(page, 'Owner One', ownerEmail)
  await addAccount(page, 'Owner private bank', '2500')
  await addExpense(page, 'Private purchase of owner one', '50', 'Owner private bank · USD')
  await signOutViaSettings(page)

  await registerAccount(page, 'Other Two', uniqueEmail('other'))
  await page.goto('./#/app/transactions')
  await expect(page.getByText('No transactions yet')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Private purchase of owner one')).toHaveCount(0)
  await page.goto('./#/app/accounts')
  await expect(page.getByText('No accounts yet')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Owner private bank')).toHaveCount(0)

  await page.keyboard.press('Control+k')
  const search = page.getByRole('combobox', { name: 'Search all records' })
  await search.fill('Owner private')
  await expect(page.getByText('No matches for “Owner private”.')).toBeVisible()
  await page.keyboard.press('Escape')

  // The owner still has their data after signing back in.
  await signOutViaSettings(page)
  await signIn(page, ownerEmail)
  await expect(page).toHaveURL(/#\/app/)
  await page.goto('./#/app/accounts')
  await expect(page.getByText('Owner private bank').first()).toBeVisible({ timeout: 20_000 })
})

test('saves an e-invoice with its file in private Cloud Storage', async ({ page, request }) => {
  await registerAccount(page, 'Ivy Invoice', uniqueEmail('ivy'))
  await page.goto('./#/app/invoices')
  await page.getByRole('main').getByRole('button', { name: 'Add invoice' }).first().click()
  const dialog = page.getByRole('dialog')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CLOUD-E2E-7</cbc:ID>
  <cbc:IssueDate>2026-03-15</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Cloud Seller GmbH</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="EUR">42.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
</Invoice>`
  await dialog.locator('input[type="file"]').first().setInputFiles({ name: 'cloud-invoice.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect(dialog.getByText('Review the details')).toBeVisible()
  await expect(dialog.getByLabel('Merchant or supplier')).toHaveValue('Cloud Seller GmbH')
  await dialog.getByRole('button', { name: 'Save invoice', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Invoice saved').first()).toBeVisible()
  await expect(page.getByRole('main').getByRole('row').filter({ hasText: 'Cloud Seller GmbH' })).toContainText('42.00')

  // The file is in the Storage emulator under users/{uid}/invoices/{invoiceId}/{sha256}.xml
  // (listed with emulator admin credentials, which bypass the rules).
  const listing = await request.get('http://127.0.0.1:9199/v0/b/demo-spendwise.appspot.com/o?prefix=users%2F', {
    headers: { Authorization: 'Bearer owner' },
  })
  expect(listing.ok()).toBe(true)
  const names = ((await listing.json()) as { items?: { name: string }[] }).items?.map((i) => i.name) ?? []
  expect(names.some((n) => /^users\/[^/]+\/invoices\/[A-Za-z0-9_-]+\/[0-9a-f]{64}\.xml$/.test(n))).toBe(true)
})

test('signed-in users are sent from the auth pages to the app, and password reset confirms neutrally', async ({ page }) => {
  await page.goto('./#/forgot-password')
  await page.getByLabel('Email').fill(uniqueEmail('nobody'))
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('If an account exists for')

  await registerAccount(page, 'Casey Test', uniqueEmail('casey'))
  await page.goto('./#/login')
  await expect(page).toHaveURL(/#\/app$/)
})
