import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Firestore security rules and repository integration tests; run via `npm run test:rules`,
// which starts the Auth and Firestore emulators.
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
