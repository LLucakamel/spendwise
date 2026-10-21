import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { addTransaction, cents, gotoApp, statCard, today } from './helpers'

test.describe('SpendWise demo', () => {
  test('launches and navigates through every section', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await gotoApp(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    const sections: [string, string][] = [
      ['Transactions', 'Transactions'],
      ['Budgets', 'Budgets'],
      ['Recurring bills', 'Recurring bills'],
      ['Analytics', 'Analytics'],
      ['Settings', 'Settings'],
      ['Dashboard', 'Dashboard'],
    ]
    const nav = page.getByRole('navigation', { name: 'Main' }).first()
    for (const [link, heading] of sections) {
      await nav.getByRole('link', { name: link }).click()
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    }
    await page.goto('/does-not-exist')
    await expect(page.getByText('Page not found')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('creates, edits and deletes a transaction and the dashboard totals follow', async ({ page }) => {
    await gotoApp(page)
    const expenses = statCard(page, 'Expenses · USD')
    const net = statCard(page, 'Net cash flow · USD')
    await expect(expenses).toBeVisible()
    const startExpenses = cents(await expenses.textContent())
    const startNet = cents(await net.textContent())

    await addTransaction(page, { description: 'E2E test purchase', amount: '10.25', category: 'Shopping', date: today() })
    await expect.poll(async () => cents(await expenses.textContent())).toBe(startExpenses + 1025)
    expect(cents(await net.textContent())).toBe(startNet - 1025)

    // Edit it on the transactions page.
    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Transactions' }).click()
    await page.getByLabel('Search transactions').fill('E2E test purchase')
    await expect(page.getByText(/^1 of \d+ transactions/)).toBeVisible()
    await page.getByRole('button', { name: 'Actions for E2E test purchase' }).first().click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByRole('dialog').getByLabel('Amount').fill('20.00')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('cell', { name: '−$20.00' })).toBeVisible()

    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Dashboard' }).click()
    await expect.poll(async () => cents(await statCard(page, 'Expenses · USD').textContent())).toBe(startExpenses + 2000)

    // Delete with confirmation.
    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Transactions' }).click()
    await page.getByLabel('Search transactions').fill('E2E test purchase')
    await page.getByRole('button', { name: 'Actions for E2E test purchase' }).first().click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByRole('alertdialog')).toContainText('will be permanently removed')
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No matching transactions')).toBeVisible()

    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Dashboard' }).click()
    await expect.poll(async () => cents(await statCard(page, 'Expenses · USD').textContent())).toBe(startExpenses)
  })

  test('searches and filters transactions', async ({ page }) => {
    await gotoApp(page, '/transactions')
    const count = page.getByText(/of \d+ transactions/)
    await page.getByLabel('Type').selectOption('income')
    await expect(page.locator('tbody tr').first()).toContainText('+')
    await expect(page.locator('tbody').getByText('−')).toHaveCount(0)
    await page.getByLabel('Type').selectOption('')
    await page.getByLabel('Currency').selectOption('EUR')
    await expect(count).toHaveText(/^3 of/)
    await page.getByLabel('Currency').selectOption('')
    await page.getByLabel('Category').selectOption({ label: 'Groceries' })
    await expect(page.locator('tbody tr').first()).toContainText('Groceries')
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.getByLabel('Search transactions').fill('zzzz-no-match')
    await expect(page.getByText('No matching transactions')).toBeVisible()
  })

  test('creates and modifies a budget and checks usage against expenses', async ({ page }) => {
    await gotoApp(page, '/budgets')
    await page.getByRole('button', { name: 'New budget' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Courses')
    await dialog.getByLabel('Expense category').selectOption({ label: 'Education' })
    await dialog.getByLabel('Monthly limit').fill('100')
    await dialog.getByRole('button', { name: 'Create budget' }).click()
    await expect(dialog).toBeHidden()
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Courses' })
    await expect(card).toContainText('0% used')

    await page.goto('/transactions')
    await addTransaction(page, { description: 'Online course', amount: '25', category: 'Education', date: today() })
    await addTransaction(page, { description: 'Refund from friend', amount: '25', category: 'Gifts', type: 'income', date: today() })
    await page.goto('/budgets')
    await expect(card).toContainText('$25.00')
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
    await page.getByRole('button', { name: 'New bill' }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('Cloud storage')
    await dialog.getByLabel('Amount').fill('2.99')
    await dialog.getByLabel('Next due date').fill(today())
    await dialog.getByRole('button', { name: 'Add bill' }).click()
    await expect(dialog).toBeHidden()
    const row = page.getByRole('listitem').filter({ hasText: 'Cloud storage' })
    await expect(row).toContainText('Due today')

    await row.getByRole('button', { name: 'Actions for Cloud storage' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Amount').fill('3.49')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(row).toContainText('$3.49')

    await row.getByRole('button', { name: 'Mark paid' }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Add an expense of $3.49')
    await dialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(dialog).toBeHidden()
    await expect(row).not.toContainText('Due today')

    await page.goto('/transactions')
    await page.getByLabel('Search transactions').fill('Cloud storage')
    await expect(page.getByText(/^1 of/)).toBeVisible()
  })

  test('charts and summaries reflect the demo data', async ({ page }) => {
    await gotoApp(page)
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
    await page.goto('/analytics')
    await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible()
    await expect(page.locator('.recharts-line-curve')).toBeVisible()
    const usdRow = page.locator('[data-slot="card"]').filter({ hasText: 'Totals by currency' }).getByRole('row', { name: /USD/ })
    await expect(usdRow).toBeVisible()
    // The currency table shows EUR and JPY separately instead of merging them into USD.
    await page.getByLabel('Period').selectOption('this-year')
    const currencyCard = page.locator('[data-slot="card"]').filter({ hasText: 'Totals by currency' })
    await expect(currencyCard.getByRole('row', { name: /EUR/ })).toBeVisible()
    await expect(currencyCard.getByRole('row', { name: /JPY/ })).toBeVisible()
  })

  test('changes theme and preferred currency, persisting across reloads', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('radio', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByLabel('Preferred display currency').selectOption('EUR')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByText('Preferences saved')).toBeVisible()
    await page.goto('/')
    await page.getByLabel('Period').selectOption('last-90-days')
    await expect(page.getByText('Expenses · EUR')).toBeVisible()
    // Existing USD amounts are untouched: the USD figures are still available.
    await page.getByRole('radio', { name: 'USD' }).click()
    await expect(page.getByText('Expenses · USD')).toBeVisible()
  })

  test('exports filtered transactions to CSV', async ({ page }) => {
    await gotoApp(page, '/transactions')
    await page.getByLabel('Currency').selectOption('EUR')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    expect(download.suggestedFilename()).toMatch(/^spendwise-transactions-\d{4}-\d{2}-\d{2}\.csv$/)
    const content = readFileSync((await download.path())!, 'utf8')
    const lines = content.replace(String.fromCharCode(0xfeff), '').trimEnd().split('\r\n')
    expect(lines[0]).toBe('Date,Type,Description,Category,Amount,Currency,Payment method,Notes,ID,Created at,Updated at')
    expect(lines).toHaveLength(4)
    expect(lines.slice(1).every((l) => l.includes(',EUR,'))).toBe(true)
    expect(content).toContain('"Hotel Azulejo, Lisbon (demo)"')
  })

  test('handles empty states and invalid input', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByRole('button', { name: 'Clear all demo data' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear data' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await page.goto('/')
    await expect(page.getByText('Welcome to SpendWise')).toBeVisible()
    await page.goto('/budgets')
    await expect(page.getByText('No budgets yet')).toBeVisible()
    await page.goto('/bills')
    await expect(page.getByText('No recurring bills yet')).toBeVisible()
    await page.goto('/analytics')
    await expect(page.getByText('No transactions in this period')).toBeVisible()
    await page.goto('/transactions')
    await expect(page.getByText('No transactions yet')).toBeVisible()

    await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog.getByText('Enter a description.')).toBeVisible()
    await dialog.getByLabel('Description').fill('Bad amount')
    await dialog.getByLabel('Amount').fill('12.345')
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog.getByText('USD allows at most 2 decimal places.')).toBeVisible()
    await dialog.getByLabel('Currency').selectOption('JPY')
    await dialog.getByLabel('Amount').fill('100.5')
    await dialog.getByRole('button', { name: 'Add transaction' }).click()
    await expect(dialog.getByText('JPY amounts have no decimal places.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('No transactions yet')).toBeVisible()
  })
})
