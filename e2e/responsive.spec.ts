import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalOverflow, go, gotoApp, mainNav } from './helpers'

/** Runs in the "desktop" (1366×900), "tablet" (820×1180) and "mobile" (390×844) projects. */
const PAGES = ['/', '/transactions', '/income', '/invoices', '/accounts', '/budgets', '/bills', '/tools', '/analytics', '/settings']

type Layout = 'desktop' | 'tablet' | 'mobile'
function layoutOf(page: Page): Layout {
  const width = page.viewportSize()!.width
  return width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile'
}

test('every main page fits the viewport without horizontal scrolling', async ({ page }) => {
  test.setTimeout(90_000)
  for (const path of PAGES) {
    await gotoApp(page, path)
    await expectNoHorizontalOverflow(page, path)
  }
})

test('every main page fits without horizontal scrolling in Arabic (RTL)', async ({ page }) => {
  test.setTimeout(90_000)
  await gotoApp(page)
  await page.getByRole('button', { name: 'Language' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  for (const path of PAGES) {
    await go(page, path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expectNoHorizontalOverflow(page, `${path} (ar)`)
  }
})

test('navigation matches the viewport size', async ({ page }) => {
  await gotoApp(page)
  const nav = mainNav(page)
  await expect(nav).toHaveCount(1)
  const box = (await nav.boundingBox())!
  const viewport = page.viewportSize()!
  const layout = layoutOf(page)

  if (layout === 'desktop') {
    // Full sidebar with text labels for every section.
    expect(box.width).toBeGreaterThan(200)
    expect(box.height).toBeGreaterThan(viewport.height / 2)
    await expect(nav.getByRole('link')).toHaveCount(10)
    await expect(nav.getByText('Recurring bills')).toBeVisible()
    await nav.getByRole('link', { name: 'Accounts', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts and cards' })).toBeVisible()
  } else if (layout === 'tablet') {
    // Narrow icon rail: every section is a labelled icon link, with a tooltip instead of visible text.
    expect(box.width).toBeLessThan(80)
    await expect(nav.getByRole('link')).toHaveCount(10)
    await expect(nav.getByText('Recurring bills')).toHaveCount(0)
    const bills = nav.getByRole('link', { name: 'Recurring bills' })
    await bills.hover()
    await expect(page.getByRole('tooltip')).toContainText('Recurring bills')
    await bills.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recurring bills' })).toBeVisible()
  } else {
    // Bottom bar: four primary sections plus "More".
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 2)
    await expect(nav.getByRole('link')).toHaveCount(4)
    for (const name of ['Home', 'Activity', 'Income', 'Invoices']) await expect(nav.getByRole('link', { name })).toBeVisible()
    await nav.getByRole('link', { name: 'Activity' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible()

    await nav.getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet).toBeVisible()
    for (const name of ['Accounts', 'Budgets', 'Recurring bills', 'Planning tools', 'Analytics', 'Settings']) {
      await expect(sheet.getByRole('link', { name })).toBeVisible()
    }
    await sheet.getByRole('link', { name: 'Budgets' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Budgets' })).toBeVisible()
    await expectNoHorizontalOverflow(page, 'after More sheet')
  }
})

test('header controls stay reachable at every size', async ({ page }) => {
  await gotoApp(page)
  for (const name of ['Search everything', 'Quick add', 'Language', 'Account menu']) {
    await expect(page.getByRole('button', { name })).toBeInViewport()
  }
})

test('transaction form is usable on this screen size', async ({ page }) => {
  await gotoApp(page, '/transactions')
  await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  await dialog.getByRole('button', { name: 'Add transaction' }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Add transaction' })).toBeInViewport()
  await expectNoHorizontalOverflow(page, 'transaction dialog')
})

test('invoice capture and statement import dialogs fit the screen', async ({ page }) => {
  await gotoApp(page, '/invoices')
  await page.getByRole('main').getByRole('button', { name: 'Add invoice' }).first().click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Choose a file' }).first()).toBeVisible()
  let box = (await dialog.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectNoHorizontalOverflow(page, 'invoice capture')
  await page.keyboard.press('Escape')

  await gotoApp(page, '/accounts')
  await page.getByRole('button', { name: 'Import statement' }).first().click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Import a statement')
  box = (await dialog.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectNoHorizontalOverflow(page, 'statement import')
})
