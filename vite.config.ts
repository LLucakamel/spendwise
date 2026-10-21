import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Base path of the deployment, e.g. "/spendwise/" for https://USER.github.io/spendwise/.
  // Set VITE_BASE_PATH (the Pages workflow derives it from the repository name); defaults to "/".
  const base = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/'
  return {
    base: base.endsWith('/') ? base : `${base}/`,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    build: {
      chunkSizeWarningLimit: 900,
    },
  }
})
