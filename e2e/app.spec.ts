import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { addTransaction, amountOf, go, gotoApp, mainNav, navTo, statCard, today } from './helpers'

test.describe('SpendWise demo', () => {
  test('launches and navigates through every section', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await gotoApp(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    await expect(mainNav(page).getByRole('link')).toHaveCount(10)
    const sections: [string, string][] = [
      ['Transactions', 'Transactions'],
      ['Income', 'Income'],
      ['Invoices', 'Invoices'],
      ['Accounts', 'Accounts and cards'],
      ['Budgets', 'Budgets'],
      ['Recurring bills', 'Recurring bills'],
      ['Planning tools', 'Planning tools'],
      ['Analytics', 'Analytics'],
      ['Settings', 'Settings'],
      ['Dashboard', 'Dashboard'],
    ]
    for (const [link, heading] of sections) await navTo(page, link, heading)
    await go(page, '/does-not-exist')
    await expect(page.getByText('Page not found')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('creates, edits and deletes a transaction and the dashboard totals follow', async ({ page }) => {
    await gotoApp(page)
    const expenses = statCard(page, 'Expenses · EGP')
    const net = statCard(page, 'Net cash flow · EGP')
    await expect(expenses).toBeVisible()
    const startExpenses = await amountOf(expenses)
    const startNet = await amountOf(net)

    await addTransaction(page, { description: 'E2E test purchase', amount: '10.25', category: 'Shopping', date: today() })
    await expect.poll(() => amountOf(expenses)).toBe(startExpenses + 1025)
    expect(await amountOf(net)).toBe(startNet - 1025)

    // Edit it on the transactions page.
    await navTo(page, 'Transactions')
    await page.getByLabel('Search transactions').fill('E2E test purchase')
    await expect(page.getByTestId('tx-count')).toHaveText(/^1 of \d+/)
    await page.getByRole('button', { name: 'Actions for E2E test purchase' }).first().click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByRole('dialog').getByLabel('Amount', { exact: true }).fill('20.00')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('tbody tr').filter({ hasText: 'E2E test purchase' })).toContainText('20.00')

    await navTo(page, 'Dashboard')
    await expect.poll(() => amountOf(statCard(page, 'Expenses · EGP'))).toBe(startExpenses + 2000)

    // Delete with confirmation.
    await navTo(page, 'Transactions')
    await page.getByLabel('Search transactions').fill('E2E test purchase')
    await page.getByRole('button', { name: 'Actions for E2E test purchase' }).first().click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('will be permanently removed')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No matching transactions')).toBeVisible()

    await navTo(page, 'Dashboard')
    await expect.poll(() => amountOf(statCard(page, 'Expenses · EGP'))).toBe(startExpenses)
  })

  test('searches and filters transactions', async ({ page }) => {
    await gotoApp(page, '/transactions')
    const rows = page.locator('tbody tr')
    await page.getByLabel('Type').selectOption('income')
    await expect(rows.first()).toContainText('+')
    await expect(page.locator('tbody').getByText('−')).toHaveCount(0)
    await page.getByLabel('Type').selectOption('')
    // Filters live in the URL; let the previous change land before the next one.
    await expect(page).not.toHaveURL(/type=income/)
    // The demo's trip abroad: two EUR expenses (hotel and tram passes).
    await page.getByLabel('Currency').selectOption('EUR')
    await expect(page.getByTestId('tx-count')).toHaveText(/^2 of/)
    await expect(rows.filter({ hasText: 'Hotel Azulejo' })).toHaveCount(1)
    await page.getByLabel('Currency').selectOption('')
    await expect(page).not.toHaveURL(/EUR/)
    await page.getByLabel('Category').selectOption({ label: 'Groceries' })
    await expect(rows.first()).toContainText('Groceries')
    await page.getByRole('button', { name: 'Clear filters' }).first().click()
    await page.getByLabel('Search transactions').fill('zzzz-no-match')
    await expect(page.getByText('No matching transactions')).toBeVisible()
  })

  test('creates and modifies a budget and checks usage against expenses', async ({ page }) => {
    await gotoApp(page, '/budgets')
    await page.getByRole('button', { name: 'New budget' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Courses')
    await dialog.getByLabel('Expense category').selectOption({ label: 'Education' })
    await dialog.getByLabel('Monthly limit').fill('100')
    await dialog.getByRole('button', { name: 'Create budget' }).click()
    await expect(dialog).toBeHidden()
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Courses' })
    await expect(card).toContainText('0% used')

    await go(page, '/transactions')
    await addTransaction(page, { description: 'Online course', amount: '25', category: 'Education', date: today() })
    await addTransaction(page, { description: 'Refund from friend', amount: '25', category: 'Gifts', type: 'income', date: today() })
    await go(page, '/budgets')
    await expect(card).toContainText('25.00')
    await expect(card).toContainText('25% used')

    await card.getByRole('button', { name: 'Actions for Courses' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByRole('dialog').getByLabel('Monthly limit').fill('30')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await expect(card).toContainText('83% used')
    await expect(card).toContainText('Near limit')
  })

  test('creates, edits and pays a recurring bill without duplicates', async ({ page }) => {
    await gotoApp(page, '/bills')
    await page.getByRole('button', { name: 'New bill' }).first().click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Cloud storage')
    await dialog.getByLabel('Amount', { exact: true }).fill('2.99')
    await dialog.getByLabel('Next due date').fill(today())
    await dialog.getByRole('button', { name: 'Add bill' }).click()
    await expect(dialog).toBeHidden()
    const row = page.getByRole('listitem').filter({ hasText: 'Cloud storage' })
    await expect(row).toContainText('Due today')

    await row.getByRole('button', { name: 'Actions for Cloud storage' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Amount', { exact: true }).fill('3.49')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(row).toContainText('3.49')

    await row.getByRole('button', { name: 'Mark paid' }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/Add an expense of EGP\s3\.49/)
    await dialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(dialog).toBeHidden()
    await expect(row).not.toContainText('Due today')

    await go(page, '/transactions')
    await page.getByLabel('Search transactions').fill('Cloud storage')
    await expect(page.getByTestId('tx-count')).toHaveText(/^1 of/)
  })

  test('charts and summaries reflect the demo data', async ({ page }) => {
    await gotoApp(page)
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
    await go(page, '/analytics')
    await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible()
    await expect(page.locator('.recharts-line-curve').first()).toBeVisible()
    const currencyCard = page.locator('[data-slot="card"]').filter({ hasText: 'Totals by currency' })
    await expect(currencyCard.getByRole('row', { name: /EGP/ })).toBeVisible()
    // EUR and USD stay separate rows instead of being merged into EGP.
    await page.getByLabel('Period').selectOption('last-90-days')
    await expect(currencyCard.getByRole('row', { name: /EUR/ })).toBeVisible()
    await expect(currencyCard.getByRole('row', { name: /USD/ })).toBeVisible()
  })

  test('changes theme and preferred currency, persisting across reloads', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByTestId('theme-options').getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByTestId('theme-options').getByRole('radio', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByLabel('Preferred display currency').selectOption('USD')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByText('Preferences saved').first()).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Preferred display currency')).toHaveValue('USD')
    await go(page, '/')
    await page.getByLabel('Period').selectOption('last-90-days')
    await expect(page.getByText('Expenses · USD')).toBeVisible()
    // Existing EGP amounts are untouched: the EGP figures are still available.
    await page.getByRole('radiogroup', { name: 'Currency shown' }).getByRole('radio', { name: 'EGP' }).click()
    await expect(page.getByText('Expenses · EGP')).toBeVisible()
  })

  test('exports filtered transactions to CSV', async ({ page }) => {
    await gotoApp(page, '/transactions')
    await page.getByLabel('Currency').selectOption('EUR')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    expect(download.suggestedFilename()).toMatch(/^spendwise-transactions-\d{4}-\d{2}-\d{2}\.csv$/)
    const content = readFileSync((await download.path())!, 'utf8')
    const lines = content.replace(String.fromCharCode(0xfeff), '').trimEnd().split('\r\n')
    expect(lines[0]).toMatch(/^Date,Type,Description,Category,Amount,Currency,/)
    expect(lines).toHaveLength(3)
    expect(lines.slice(1).every((l) => l.includes(',EUR,'))).toBe(true)
    expect(content).toContain('"Hotel Azulejo, Lisbon (demo)"')
  })

  test('handles empty states and invalid input', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByTestId('clear-demo').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear data' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await go(page, '/')
    await expect(page.getByText('Welcome to SpendWise')).toBeVisible()
    await go(page, '/budgets')
    await expect(page.getByText('No budgets yet')).toBeVisible()
    await go(page, '/bills')
    await expect(page.getByText('No recurring bills yet')).toBeVisible()
    await go(page, '/invoices')
    await expect(page.getByText('No invoices yet')).toBeVisible()
    await go(page, '/accounts')
    await expect(page.getByText('No accounts yet')).toBeVisible()
    await go(page, '/income')
    await expect(page.getByText('No income sources yet')).toBeVisible()
    await go(page, '/analytics')
    await expect(page.getByText('No transactions in this period')).toBeVisible()
    await go(page, '/transactions')
    await expect(page.getByText('No transactions yet')).toBeVisible()

    await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog.getByText('Enter a description.')).toBeVisible()
    await dialog.getByLabel('Description').fill('Bad amount')
    await dialog.getByLabel('Currency').selectOption('USD')
    await dialog.getByLabel('Amount', { exact: true }).fill('12.345')
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog.getByText('USD allows at most 2 decimal places.')).toBeVisible()
    await dialog.getByLabel('Currency').selectOption('JPY')
    await dialog.getByLabel('Amount', { exact: true }).fill('100.5')
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog.getByText('JPY amounts have no decimal places.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('No transactions yet')).toBeVisible()
  })
})
