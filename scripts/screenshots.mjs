// Captures README screenshots from a running production build (fictional demo data only).
// Usage: npm run build && npx vite preview --port 4173, then `node scripts/screenshots.mjs`.
import { mkdirSync } from 'node:fs'
import { chromium, devices } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/'
const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })

async function shoot(name, hashPath, { theme = 'light', device, fullPage = false, before } = {}) {
  const context = await browser.newContext(device ? devices[device] : { viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  await context.addInitScript((t) => localStorage.setItem('spendwise.theme', t), theme)
  const page = await context.newPage()
  await page.goto(`${BASE}#${hashPath}`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.waitForTimeout(800)
  if (before) await before(page)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  await context.close()
}

await shoot('landing', '/')
await shoot('register', '/register')
await shoot('dashboard-light', '/demo')
await shoot('dashboard-dark', '/demo', { theme: 'dark' })
await shoot('transactions', '/demo/transactions')
await shoot('budgets', '/demo/budgets')
await shoot('bills', '/demo/bills')
await shoot('analytics', '/demo/analytics', { fullPage: true })
await shoot('settings', '/demo/settings')
await shoot('search', '/demo', {
  before: async (page) => {
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill('gro')
    await page.waitForTimeout(300)
  },
})
await shoot('mobile-dashboard', '/demo', { device: 'Pixel 7' })
await shoot('mobile-landing', '/', { device: 'Pixel 7', theme: 'dark' })
await browser.close()
console.log(`Saved screenshots to ${OUT}/`)
