import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { go, gotoApp } from './helpers'

test.describe('landing, routing and deployment under /spendwise/', () => {
  test('landing page offers an explicit demo entry; demo can be exited', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: /Know where your money goes/ })).toBeVisible()
    await expect(page.getByText(/Account sign-up isn’t configured/)).toBeVisible()
    await page.getByRole('link', { name: /Try the demo/ }).click()
    await expect(page).toHaveURL(/\/spendwise\/#\/demo$/)
    await expect(page.getByText('Demo mode').first()).toBeVisible()
    await page.getByRole('link', { name: 'Exit demo' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Know where your money goes/ })).toBeVisible()
  })

  test('all same-origin assets load from the base path and nested routes survive a refresh', async ({ page }) => {
    const failures: string[] = []
    page.on('response', (r) => {
      if (r.url().startsWith('http://localhost:4173') && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`)
    })
    page.on('requestfailed', (r) => {
      if (r.url().startsWith('http://localhost:4173')) failures.push(`failed ${r.url()}`)
    })
    await page.goto('./')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/spendwise/manifest.webmanifest')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/spendwise/favicon.svg')
    await go(page, '/budgets')
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible()
    const manifest = await page.request.get('manifest.webmanifest')
    expect(manifest.ok()).toBe(true)
    expect(failures).toEqual([])
  })

  test('registers the service worker scoped to the base path', async ({ page }) => {
    await page.goto('./')
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toBe('http://localhost:4173/spendwise/')
  })

  test('account routes explain that Firebase is not configured instead of showing demo data', async ({ page }) => {
    await page.goto('./#/app/transactions')
    await expect(page.getByText('Accounts aren’t available on this deployment')).toBeVisible()
    await expect(page.getByText('Demo mode')).toHaveCount(0)
    await page.goto('./#/login')
    await expect(page.getByText('Accounts aren’t available on this deployment')).toBeVisible()
  })
})

test.describe('search, filters and data tools', () => {
  test('global search finds a record and opens it', async ({ page }) => {
    await gotoApp(page)
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox', { name: /Search transactions/ })
    await search.fill('greenleaf')
    await expect(page.getByRole('option').first()).toContainText('Greenleaf Market')
    await search.press('Enter')
    await expect(page).toHaveURL(/#\/demo\/transactions/)
    await expect(page.getByRole('dialog')).toContainText('Transaction details')
    await expect(page.getByRole('dialog')).toContainText('Greenleaf Market')
  })

  test('advanced filters combine amount range and payment method', async ({ page }) => {
    await gotoApp(page, '/transactions')
    await page.getByRole('button', { name: 'More filters' }).click()
    await page.getByLabel('Min amount').fill('1000')
    await page.getByLabel('Currency').selectOption('USD')
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const amounts = await rows.locator('td:nth-child(4)').allTextContents()
    expect(amounts.length).toBeGreaterThan(0)
    for (const text of amounts) expect(Number(text.replace(/[^0-9.]/g, ''))).toBeGreaterThanOrEqual(1000)
    await page.getByLabel('Payment method').selectOption('bank-transfer')
    await expect(page.getByText(/of \d+ transactions/)).toBeVisible()
    // Filters are kept when leaving and returning to the page.
    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Budgets' }).click()
    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Transactions' }).click()
    await expect(page.getByLabel('Min amount')).toHaveValue('1000')
  })

  test('converts multi-currency totals with a dated, sourced rate (mocked API)', async ({ page }) => {
    await page.route('https://api.frankfurter.dev/**', (route) =>
      route.fulfill({ json: { amount: 1, base: 'USD', date: '2026-10-20', rates: { EUR: 0.9, JPY: 150 } } }),
    )
    await gotoApp(page)
    await page.getByLabel('Period').selectOption('last-90-days')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Expenses across currencies' })
    await card.getByRole('button', { name: 'Convert to USD' }).click()
    await expect(card).toContainText('1 USD = 0.9 EUR')
    await expect(card).toContainText('1 USD = 150 JPY')
    await expect(card).toContainText('Approximate total')
    await expect(card).toContainText('European Central Bank reference rates')
  })

  test('keeps totals separate when the rate service fails', async ({ page }) => {
    await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ status: 429, json: { message: 'Too many requests' } }))
    await gotoApp(page)
    await page.getByLabel('Period').selectOption('last-90-days')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Expenses across currencies' })
    await card.getByRole('button', { name: 'Convert to USD' }).click()
    await expect(card.getByRole('alert')).toContainText('limiting requests')
    await expect(card).toContainText('Totals remain separate by currency')
    await expect(card).not.toContainText('Approximate total')
  })

  test('downloads a JSON backup and restores it', async ({ page }) => {
    await gotoApp(page, '/settings')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()])
    const path = (await download.path())!
    const backup = JSON.parse(readFileSync(path, 'utf8')) as { format: string; source: string; data: { transactions: unknown[] } }
    expect(backup.format).toBe('spendwise-backup')
    expect(backup.source).toBe('demo')
    expect(backup.data.transactions.length).toBeGreaterThan(50)

    await page.getByRole('button', { name: 'Clear all demo data' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear data' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose file' }).click()])
    await chooser.setFiles(path)
    await expect(page.getByRole('alertdialog')).toContainText(`${backup.data.transactions.length} transactions`)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('Backup restored')).toBeVisible()
    await go(page, '/transactions')
    await expect(page.getByText(new RegExp(`of ${backup.data.transactions.length} transactions`))).toBeVisible()
  })

  test('resets the demo to its sample data', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByRole('button', { name: 'Clear all demo data' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear data' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await page.getByRole('button', { name: 'Reset sample data' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await go(page, '/transactions')
    await expect(page.getByText('No transactions yet')).toHaveCount(0)
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })
})
