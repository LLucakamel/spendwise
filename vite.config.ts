import { createReadStream, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Serves (dev) and emits (build) the OCR engine files under <base>/tesseract/ so document
 * recognition runs from this site instead of a third-party CDN.
 */
function selfHostedOcr(): Plugin {
  const nm = path.resolve(import.meta.dirname, 'node_modules')
  const files: Record<string, string> = {
    'tesseract/worker.min.js': path.join(nm, 'tesseract.js/dist/worker.min.js'),
    'tesseract/core/tesseract-core-lstm.wasm.js': path.join(nm, 'tesseract.js-core/tesseract-core-lstm.wasm.js'),
    'tesseract/core/tesseract-core-simd-lstm.wasm.js': path.join(nm, 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
    'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js': path.join(nm, 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'),
    'tesseract/lang/eng.traineddata.gz': path.join(nm, '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
    'tesseract/lang/ara.traineddata.gz': path.join(nm, '@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz'),
  }
  let base = '/'
  return {
    name: 'spendwise-self-hosted-ocr',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? ''
        const key = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, '')
        const file = files[key]
        if (!file || !existsSync(file)) return next()
        res.setHeader('Content-Type', key.endsWith('.gz') ? 'application/octet-stream' : 'text/javascript')
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(source) })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Base path of the deployment, e.g. "/spendwise/" for https://USER.github.io/spendwise/.
  // Set VITE_BASE_PATH (the Pages workflow derives it from the repository name); defaults to "/".
  const base = env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/'
  return {
    base: base.endsWith('/') ? base : `${base}/`,
    plugins: [react(), tailwindcss(), selfHostedOcr()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  }
})
