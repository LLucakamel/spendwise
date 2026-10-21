import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'goodpass1'
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`

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
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/#\/login/)
}

test('registers, stores data in Firestore, signs out, protects routes and signs back in', async ({ page }) => {
  const email = uniqueEmail('alice')
  await registerAccount(page, 'Alice Example', email)

  // First transaction through onboarding.
  await page.getByRole('button', { name: 'Add expense' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Description').fill('Cloud test expense')
  await dialog.getByLabel('Amount').fill('12.34')
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Expenses · USD')).toBeVisible()

  // Session survives a reload (Firebase local persistence).
  await page.reload()
  await expect(page.getByText('Expenses · USD')).toBeVisible({ timeout: 20_000 })

  await signOutViaSettings(page)

  // Private routes redirect to sign-in.
  await page.goto('./#/app/transactions')
  await expect(page).toHaveURL(/#\/login/)

  // Wrong password is rejected with a generic message.
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('wrongpass1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('The email or password is incorrect.')

  // Correct password returns to the page that was requested, with the stored data.
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/#\/app\/transactions/)
  await expect(page.getByText('Cloud test expense').first()).toBeVisible({ timeout: 20_000 })
})

test('a second account cannot see the first account’s records', async ({ page }) => {
  await registerAccount(page, 'Owner One', uniqueEmail('owner'))
  await page.getByRole('button', { name: 'Add income' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Description').fill('Private salary of owner one')
  await dialog.getByLabel('Amount').fill('5000')
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()
  await signOutViaSettings(page)

  await registerAccount(page, 'Other Two', uniqueEmail('other'))
  await page.goto('./#/app/transactions')
  await expect(page.getByText('No transactions yet')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Private salary of owner one')).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: /Search transactions/ }).fill('Private salary')
  await expect(page.getByText('No matches for “Private salary”.')).toBeVisible()
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
