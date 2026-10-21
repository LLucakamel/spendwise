import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Parses a formatted en-US amount such as "+EGP 1,234.56", "−$12.00" or "-EGP 5.00" into integer
 * minor units (cents/piastres). Only digits, the decimal point and a leading sign are considered.
 */
export function cents(text: string | null): number {
  if (!text) throw new Error('No amount text')
  const negative = /^[−-]/.test(text.trim())
  const digits = text.replace(/[^0-9.]/g, '')
  const [whole = '0', fraction = ''] = digits.split('.')
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -value : value
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The value shown in a dashboard stat card, e.g. "Expenses · EGP". */
export function statCard(page: Page, title: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: title }).locator('p.tracking-tight')
}

/** Reads a stat/amount locator as minor units. */
export async function amountOf(locator: Locator): Promise<number> {
  return cents(await locator.textContent())
}

/** The main navigation that is visible at the current viewport (sidebar, icon rail or bottom bar). */
export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main' })
}

/** Opens a demo route, e.g. go(page, '/budgets') → /spendwise/#/demo/budgets. */
export async function go(page: Page, path = '/') {
  await page.goto(`./#/demo${path === '/' ? '' : path}`)
}

/** Opens a demo route and waits until the demo data is loaded and the page heading is shown. */
export async function gotoApp(page: Page, path = '/') {
  await go(page, path)
  // Generous on purpose: the first page load of a worker (cold preview server, lazy chunks) can take a few seconds.
  await expect(page.getByText('Demo mode', { exact: false }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
}

/** Navigates with the visible desktop sidebar / tablet rail. */
export async function navTo(page: Page, link: string, heading = link) {
  await mainNav(page).getByRole('link', { name: link, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

export async function addTransaction(
  page: Page,
  values: { type?: 'income' | 'expense'; description: string; amount: string; category?: string; currency?: string; date?: string; accountId?: string },
) {
  await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  if (values.type === 'income') await dialog.getByRole('radio', { name: 'Income' }).click()
  await dialog.getByLabel('Description').fill(values.description)
  await dialog.getByLabel('Amount', { exact: true }).fill(values.amount)
  if (values.currency) await dialog.getByLabel('Currency').selectOption(values.currency)
  if (values.category) await dialog.getByLabel('Category').selectOption({ label: values.category })
  if (values.date) await dialog.getByLabel('Date', { exact: true }).fill(values.date)
  if (values.accountId) await dialog.getByLabel('Account', { exact: true }).selectOption(values.accountId)
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()
}

/** Asserts the document doesn't scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0)
}
