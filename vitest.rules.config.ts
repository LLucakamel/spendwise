import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Firestore and Storage security rules tests plus repository integration tests (tests/rules/,
// including storage.rules.test.ts); run via `npm run test:rules`, which starts the Auth,
// Firestore and Storage emulators.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
