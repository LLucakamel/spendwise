import { defineConfig, devices } from '@playwright/test'

// Its own port (not the dev server's 5173 or the emulator suite's 5174) so the suite always tests a fresh build.
const PORT = Number(process.env.PW_PORT ?? 4183)
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
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
    channel,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1366, height: 900 } } },
    // Layout-only projects: phone (bottom bar + "More" sheet) and tablet (icon rail).
    { name: 'mobile', use: { ...devices['Pixel 7'], channel, viewport: { width: 390, height: 844 } }, testMatch: /responsive\.spec\.ts/ },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 820, height: 1180 }, hasTouch: true }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    // No Firebase variables: like a Pages deployment without Firebase, so the demo must still work.
    env: { VITE_BASE_PATH: BASE_PATH, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_APP_ID: '' },
    // Always build and serve the current code; never reuse whatever happens to be listening on the port.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
