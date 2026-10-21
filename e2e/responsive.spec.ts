import { expect, test } from '@playwright/test'
import { gotoApp } from './helpers'

const PAGES = ['/', '/transactions', '/budgets', '/bills', '/analytics', '/settings']

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page, path: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
}

test('pages fit the viewport without horizontal scrolling', async ({ page }) => {
  for (const path of PAGES) {
    await gotoApp(page, path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await assertNoHorizontalOverflow(page, path)
  }
})

test('navigation matches the viewport size', async ({ page, isMobile }) => {
  await gotoApp(page)
  const navs = page.getByRole('navigation', { name: 'Main' })
  if (isMobile) {
    // Bottom tab bar on phones.
    const bottom = navs.last()
    await expect(bottom).toBeVisible()
    await bottom.getByRole('link', { name: 'Bills' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Recurring bills' })).toBeVisible()
  } else {
    await expect(navs.first()).toBeVisible()
  }
})

test('transaction form is usable on a narrow screen', async ({ page }) => {
  await gotoApp(page, '/transactions')
  await page.getByRole('main').getByRole('button', { name: 'Add transaction' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  await expect(dialog.getByRole('button', { name: 'Add transaction' })).toBeInViewport()
  await assertNoHorizontalOverflow(page, 'transaction dialog')
})
