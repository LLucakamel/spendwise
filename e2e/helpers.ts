import { expect, type Locator, type Page } from '@playwright/test'

/** Parses a formatted en-US amount such as "+$1,234.56" or "−$12.00" into integer cents. */
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

/** The value shown in a dashboard stat card, e.g. "Expenses · USD". */
export function statCard(page: Page, title: string): Locator {
  return page.locator('[data-slot="card"]').filter({ hasText: title }).locator('p.tracking-tight')
}

/** Opens a demo route, e.g. go(page, '/budgets') → /spendwise/#/demo/budgets. */
export async function go(page: Page, path = '/') {
  await page.goto(`./#/demo${path === '/' ? '' : path}`)
}

export async function gotoApp(page: Page, path = '/') {
  await go(page, path)
  await expect(page.getByText('Demo mode', { exact: false }).first()).toBeVisible()
}

export async function addTransaction(
  page: Page,
  values: { type?: 'income' | 'expense'; description: string; amount: string; category?: string; currency?: string; date?: string },
) {
  await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  if (values.type === 'income') await dialog.getByRole('radio', { name: 'income' }).click()
  await dialog.getByLabel('Description').fill(values.description)
  await dialog.getByLabel('Amount').fill(values.amount)
  if (values.currency) await dialog.getByLabel('Currency').selectOption(values.currency)
  if (values.category) await dialog.getByLabel('Category').selectOption({ label: values.category })
  if (values.date) await dialog.getByLabel('Date').fill(values.date)
  await dialog.getByRole('button', { name: 'Add transaction' }).click()
  await expect(dialog).toBeHidden()
}
