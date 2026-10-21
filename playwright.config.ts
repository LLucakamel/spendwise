import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
/** E2E runs the production build under a sub-path, exactly like GitHub Pages serves it. */
const BASE_PATH = '/spendwise/'

/**
 * End-to-end tests run against a production build served under /spendwise/ (as on GitHub Pages).
 * Browser: the locally installed Microsoft Edge (channel "msedge") by default;
 * set PW_CHANNEL=chromium after `npx playwright install chromium` to use Playwright's bundled browser.
 */
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Two workers keep memory use reasonable on 8 GB machines (more caused browser crashes here).
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
    channel,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    // No Firebase variables: like a Pages deployment without Firebase, so the demo must still work.
    env: { VITE_BASE_PATH: BASE_PATH, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_APP_ID: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
