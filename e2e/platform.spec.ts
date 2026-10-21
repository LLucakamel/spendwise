import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { go, gotoApp, mainNav } from './helpers'

test.describe('landing, routing and deployment under /spendwise/', () => {
  test('landing page offers an explicit demo entry; demo can be exited', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: /Know where your money goes/ })).toBeVisible()
    await expect(page.getByText(/Account sign-up isn’t configured/)).toBeVisible()
    await page.getByRole('link', { name: /Try the demo/ }).first().click()
    await expect(page).toHaveURL(/\/spendwise\/#\/demo$/)
    await expect(page.getByText('Demo mode').first()).toBeVisible()
    await page.getByRole('link', { name: 'Exit demo' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Know where your money goes/ })).toBeVisible()
  })

  test('all same-origin assets load from the base path and nested routes survive a refresh', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin
    const failures: string[] = []
    page.on('response', (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`)
    })
    page.on('requestfailed', (r) => {
      if (r.url().startsWith(origin)) failures.push(`failed ${r.url()}`)
    })
    await page.goto('./')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/spendwise/manifest.webmanifest')
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/spendwise/favicon.svg')
    await go(page, '/budgets')
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible()
    const manifest = await page.request.get('manifest.webmanifest')
    expect(manifest.ok()).toBe(true)
    // The self-hosted OCR engine files are deployed under the base path too.
    for (const asset of ['tesseract/worker.min.js', 'tesseract/lang/eng.traineddata.gz', 'tesseract/core/tesseract-core-simd-lstm.wasm.js']) {
      const res = await page.request.head(asset)
      expect(res.ok(), asset).toBe(true)
    }
    expect(failures).toEqual([])
  })

  test('registers the service worker scoped to the base path', async ({ page, baseURL }) => {
    await page.goto('./')
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toBe(baseURL)
  })

  test('account routes explain that Firebase is not configured instead of showing demo data', async ({ page }) => {
    await page.goto('./#/app/transactions')
    await expect(page.getByText('Accounts aren’t available on this deployment')).toBeVisible()
    await expect(page.getByText('Demo mode')).toHaveCount(0)
    await page.goto('./#/login')
    await expect(page.getByText('Accounts aren’t available on this deployment')).toBeVisible()
  })
})

test.describe('header: language, quick add, account menu', () => {
  test('switches the whole interface to Arabic (RTL) and back', async ({ page }) => {
    await gotoApp(page)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'en')
    await expect(html).toHaveAttribute('dir', 'ltr')

    await page.getByRole('button', { name: 'Language' }).click()
    await expect(html).toHaveAttribute('dir', 'rtl')
    await expect(html).toHaveAttribute('lang', 'ar')
    const nav = page.getByRole('navigation', { name: 'القائمة الرئيسية' })
    await expect(nav).toBeVisible()
    for (const label of ['لوحة التحكم', 'المعاملات', 'الدخل', 'الفواتير', 'الحسابات', 'الميزانيات', 'الإعدادات']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('heading', { level: 1, name: 'لوحة التحكم' })).toBeVisible()
    // The sidebar sits on the right in RTL.
    const box = await nav.boundingBox()
    expect(box!.x).toBeGreaterThan(page.viewportSize()!.width / 2)
    await nav.getByRole('link', { name: 'المعاملات', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'المعاملات' })).toBeVisible()

    // The choice survives a reload.
    await page.reload()
    await expect(html).toHaveAttribute('dir', 'rtl')

    await page.getByRole('button', { name: 'اللغة' }).click()
    await expect(html).toHaveAttribute('dir', 'ltr')
    await expect(html).toHaveAttribute('lang', 'en')
    await expect(mainNav(page).getByRole('link', { name: 'Transactions', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible()
  })

  test('quick add opens the matching form; theme toggle and account menu work', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'Quick add' }).click()
    await page.getByRole('menuitem', { name: 'Income' }).click()
    await expect(page).toHaveURL(/#\/demo\/transactions/)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('New transaction')
    await expect(dialog.getByRole('radio', { name: 'Income' })).toHaveAttribute('aria-checked', 'true')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Quick add' }).click()
    await page.getByRole('menuitem', { name: 'Upload invoice' }).click()
    await expect(page.getByRole('dialog')).toContainText('Add an invoice')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(page.getByRole('menu')).toContainText('Demo visitor')
    await page.getByRole('menuitem', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  })
})

test.describe('search, filters and data tools', () => {
  test('global search finds an invoice and opens it', async ({ page }) => {
    await gotoApp(page)
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox', { name: 'Search all records' })
    await search.fill('EL-2026-0918')
    const option = page.getByRole('option').first()
    await expect(option).toContainText('North Delta Electricity')
    await search.press('Enter')
    await expect(page).toHaveURL(/#\/demo\/invoices/)
    await expect(page.getByRole('dialog')).toContainText('North Delta Electricity (demo)')
    await expect(page.getByRole('dialog')).toContainText('EL-2026-0918')
  })

  test('global search opens a transaction from the header button', async ({ page }) => {
    await gotoApp(page, '/budgets')
    await page.getByRole('button', { name: 'Search everything' }).click()
    const search = page.getByRole('combobox', { name: 'Search all records' })
    await search.fill('hotel azulejo')
    await page.getByRole('option').filter({ hasText: 'Hotel Azulejo' }).first().click()
    await expect(page).toHaveURL(/#\/demo\/transactions/)
    await expect(page.getByRole('dialog')).toContainText('Transaction details')
    await expect(page.getByRole('dialog')).toContainText('Hotel Azulejo, Lisbon (demo)')
  })

  test('advanced filters combine amount range and payment method', async ({ page }) => {
    await gotoApp(page, '/transactions')
    await page.getByRole('button', { name: 'More filters' }).click()
    await page.getByLabel('Min amount').fill('1000')
    // Filters live in the URL; let each change land before the next one.
    await expect(page).toHaveURL(/min=1000/)
    await page.getByLabel('Currency').selectOption('EGP')
    await expect(page).toHaveURL(/currency=EGP/)
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    const amounts = await rows.locator('td:nth-child(5)').allTextContents()
    expect(amounts.length).toBeGreaterThan(0)
    for (const text of amounts) expect(Number(text.replace(/[^0-9.]/g, ''))).toBeGreaterThanOrEqual(1000)
    await page.getByLabel('Payment method').selectOption('bank-transfer')
    await expect(page).toHaveURL(/method=bank-transfer/)
    await expect(page.getByTestId('tx-count')).toBeVisible()
    for (const text of await rows.locator('td:nth-child(5)').allTextContents()) expect(Number(text.replace(/[^0-9.]/g, ''))).toBeGreaterThanOrEqual(1000)
    // Filters are kept when leaving and returning to the page.
    await mainNav(page).getByRole('link', { name: 'Budgets', exact: true }).click()
    await mainNav(page).getByRole('link', { name: 'Transactions', exact: true }).click()
    await expect(page.getByLabel('Min amount')).toHaveValue('1000')
  })

  test('explains when the display currency has no reference rate (EGP)', async ({ page }) => {
    await gotoApp(page)
    await page.getByLabel('Period').selectOption('last-90-days')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Expenses across currencies' })
    await expect(card).toContainText('EGP isn’t covered by the exchange-rate source')
    await expect(card.getByRole('button', { name: /Convert to/ })).toHaveCount(0)
  })

  test('converts multi-currency totals with a dated, sourced rate (mocked API)', async ({ page }) => {
    await page.route('https://api.frankfurter.dev/**', (route) =>
      route.fulfill({ json: { amount: 1, base: 'USD', date: '2026-10-20', rates: { EUR: 0.9, JPY: 150 } } }),
    )
    await gotoApp(page, '/settings')
    await page.getByLabel('Preferred display currency').selectOption('USD')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByText('Preferences saved').first()).toBeVisible()
    await go(page, '/')
    await page.getByLabel('Period').selectOption('last-90-days')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Expenses across currencies' })
    await card.getByRole('button', { name: 'Convert to USD' }).click()
    await expect(card).toContainText('1 USD = 0.9 EUR')
    await expect(card).toContainText('1 USD = 150 JPY')
    await expect(card).toContainText('Approximate total')
    await expect(card).toContainText('European Central Bank reference rates')
    // EGP has no ECB reference rate, so it is excluded rather than guessed.
    await expect(card).toContainText(/EGP/)
  })

  test('keeps totals separate when the rate service fails', async ({ page }) => {
    await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ status: 429, json: { message: 'Too many requests' } }))
    await gotoApp(page, '/settings')
    await page.getByLabel('Preferred display currency').selectOption('USD')
    await page.getByRole('button', { name: 'Save preferences' }).click()
    await expect(page.getByText('Preferences saved').first()).toBeVisible()
    await go(page, '/')
    await page.getByLabel('Period').selectOption('last-90-days')
    const card = page.locator('[data-slot="card"]').filter({ hasText: 'Expenses across currencies' })
    await card.getByRole('button', { name: 'Convert to USD' }).click()
    await expect(card.getByRole('alert')).toContainText('limiting requests')
    await expect(card).toContainText('Totals remain separate by currency')
    await expect(card).not.toContainText('Approximate total')
  })

  test('downloads a JSON backup and restores it', async ({ page }) => {
    await gotoApp(page, '/settings')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-backup').click()])
    const path = (await download.path())!
    const backup = JSON.parse(readFileSync(path, 'utf8')) as { format: string; source: string; data: { transactions: unknown[] } }
    expect(backup.format).toBe('spendwise-backup')
    expect(backup.source).toBe('demo')
    expect(backup.data.transactions.length).toBeGreaterThan(50)

    await page.getByTestId('clear-demo').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear data' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose file' }).click()])
    await chooser.setFiles(path)
    await expect(page.getByRole('alertdialog')).toContainText(`${backup.data.transactions.length} transactions`)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('Backup restored').first()).toBeVisible()
    await go(page, '/transactions')
    await expect(page.getByTestId('tx-count')).toHaveText(new RegExp(`of ${backup.data.transactions.length}$`))
  })

  test('resets the demo to its sample data', async ({ page }) => {
    await gotoApp(page, '/settings')
    await page.getByTestId('clear-demo').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear data' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await page.getByTestId('reset-demo').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await go(page, '/transactions')
    await expect(page.getByText('No transactions yet')).toHaveCount(0)
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await go(page, '/accounts')
    await expect(page.getByRole('main')).toContainText('4242')
  })
})
