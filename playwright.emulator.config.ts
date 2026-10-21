import { defineConfig, devices } from '@playwright/test'

const PORT = 5174

/**
 * Account flows against the Firebase Auth + Firestore emulators (project "demo-spendwise").
 * Run with `npm run test:e2e:firebase`, which starts the emulators around this suite.
 */
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge')

export default defineConfig({
  // Separate from the demo suite's output so both can run at the same time.
  outputDir: 'test-results/emulator',
  testDir: './e2e-firebase',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    channel,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 860 },
  },
  webServer: {
    // Production build (served locally) so the suite exercises the code that ships.
    command: `npx vite build --mode emulator --outDir dist-emulator && npx vite preview --mode emulator --outDir dist-emulator --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
