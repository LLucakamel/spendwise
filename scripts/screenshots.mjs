// Captures README screenshots from a running demo build.
// Usage: npm run build:demo && npx vite preview --port 4173, then `node scripts/screenshots.mjs`.
import { mkdirSync } from 'node:fs'
import { chromium, devices } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })

async function shoot(name, path, { theme = 'light', device, fullPage = false } = {}) {
  const context = await browser.newContext(device ? devices[device] : { viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  await context.addInitScript((t) => localStorage.setItem('spendwise.theme', t), theme)
  const page = await context.newPage()
  await page.goto(BASE + path)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  await context.close()
}

await shoot('dashboard-light', '/')
await shoot('dashboard-dark', '/', { theme: 'dark' })
await shoot('transactions', '/transactions')
await shoot('budgets', '/budgets')
await shoot('bills', '/bills')
await shoot('analytics', '/analytics', { fullPage: true })
await shoot('settings', '/settings')
await shoot('mobile-dashboard', '/', { device: 'Pixel 7' })
await browser.close()
console.log(`Saved screenshots to ${OUT}/`)
