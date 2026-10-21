/**
 * Document reading that runs entirely in the browser:
 * - Tesseract.js (OCR, Arabic + English) with worker, WASM core and language data served from this
 *   site — the document image never leaves the device;
 * - pdf.js for PDF text layers and page rendering;
 * - jsQR for QR codes.
 * Heavy libraries are imported only when a document is processed.
 */
import { MAX_PDF_PAGES } from '../files'

export type OcrLanguage = 'eng' | 'ara'

export interface OcrProgress {
  stage: 'loading-engine' | 'recognizing' | 'reading-pdf' | 'scanning-qr'
  /** 0–1 when the engine reports it. */
  progress: number | null
  page?: number
  pages?: number
}

export class OcrCancelledError extends Error {
  constructor() {
    super('Document processing was cancelled.')
    this.name = 'OcrCancelledError'
  }
}

const assetBase = () => `${import.meta.env.BASE_URL}tesseract`

export interface OcrResult {
  text: string
  /** Tesseract's own mean word confidence (0–100) for the page, as reported by the engine. */
  engineConfidence: number | null
}

/** Recognises text on one image. Cancelling terminates the worker immediately. */
export async function recognize(
  image: HTMLCanvasElement | Blob,
  languages: OcrLanguage[],
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<OcrResult> {
  if (signal?.aborted) throw new OcrCancelledError()
  onProgress({ stage: 'loading-engine', progress: null })
  const { createWorker, OEM } = await import('tesseract.js')
  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    workerPath: `${assetBase()}/worker.min.js`,
    corePath: `${assetBase()}/core`,
    langPath: `${assetBase()}/lang`,
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress({ stage: 'recognizing', progress: m.progress })
    },
  })
  const abort = () => void worker.terminate()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    if (signal?.aborted) throw new OcrCancelledError()
    const { data } = await worker.recognize(image)
    if (signal?.aborted) throw new OcrCancelledError()
    return { text: data.text, engineConfidence: Number.isFinite(data.confidence) ? Math.round(data.confidence) : null }
  } catch (error) {
    if (signal?.aborted) throw new OcrCancelledError()
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    await worker.terminate().catch(() => undefined)
  }
}

export interface PdfContent {
  pageCount: number
  /** Text from the PDF's own text layer (digital PDFs). Empty for scanned PDFs. */
  text: string
  /** Rendered pages, for OCR and QR scanning. */
  pages: HTMLCanvasElement[]
}

/** Reads up to MAX_PDF_PAGES pages: the embedded text layer plus a rendering of each page. */
export async function readPdf(data: ArrayBuffer, onProgress: (p: OcrProgress) => void, signal?: AbortSignal): Promise<PdfContent> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  try {
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES)
    const pages: HTMLCanvasElement[] = []
    const texts: string[] = []
    for (let n = 1; n <= pageCount; n++) {
      if (signal?.aborted) throw new OcrCancelledError()
      onProgress({ stage: 'reading-pdf', progress: (n - 1) / pageCount, page: n, pages: pageCount })
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      // Rebuild lines from text items by their vertical position.
      const rows = new Map<number, { x: number; s: string }[]>()
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = Math.round(item.transform[5] ?? 0)
        const row = rows.get(y) ?? []
        row.push({ x: item.transform[4] ?? 0, s: item.str })
        rows.set(y, row)
      }
      texts.push(
        [...rows.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, row]) => row.sort((a, b) => a.x - b.x).map((r) => r.s).join(' '))
          .join('\n'),
      )
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is not available.')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      pages.push(canvas)
    }
    return { pageCount: doc.numPages, text: texts.join('\n\n').trim(), pages }
  } finally {
    await task.destroy()
  }
}

/** Draws an image file onto a canvas, rotated by a multiple of 90° and optionally cropped (fractions 0–1). */
export async function imageToCanvas(
  blob: Blob,
  rotation: 0 | 90 | 180 | 270 = 0,
  crop?: { x: number; y: number; width: number; height: number },
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob)
  const sx = crop ? Math.round(crop.x * bitmap.width) : 0
  const sy = crop ? Math.round(crop.y * bitmap.height) : 0
  const sw = crop ? Math.round(crop.width * bitmap.width) : bitmap.width
  const sh = crop ? Math.round(crop.height * bitmap.height) : bitmap.height
  const swap = rotation === 90 || rotation === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? sh : sw
  canvas.height = swap ? sw : sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(bitmap, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
  bitmap.close()
  return canvas
}

/** Finds a QR code on a canvas and returns its text payload, or null. */
export async function scanQr(canvas: HTMLCanvasElement): Promise<string | null> {
  const { default: jsQR } = await import('jsqr')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Large scans are downscaled for speed; QR codes survive moderate scaling.
  const scale = Math.min(1, 1600 / Math.max(canvas.width, canvas.height))
  let source = canvas
  if (scale < 1) {
    source = document.createElement('canvas')
    source.width = Math.round(canvas.width * scale)
    source.height = Math.round(canvas.height * scale)
    source.getContext('2d')?.drawImage(canvas, 0, 0, source.width, source.height)
  }
  const image = source.getContext('2d')?.getImageData(0, 0, source.width, source.height)
  if (!image) return null
  return jsQR(image.data, image.width, image.height)?.data ?? null
}
