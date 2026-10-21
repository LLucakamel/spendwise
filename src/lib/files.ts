/** Upload limits for invoices and statements. */
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024
export const MAX_PDF_PAGES = 5
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024

export type DetectedFileType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'application/json' | 'application/xml' | 'text/csv' | null

/**
 * Detects the real file type from its first bytes (magic numbers), so a renamed file can't pass as
 * an image or PDF. JSON/XML/CSV are text formats and are recognised by their first characters.
 */
export function sniffFileType(head: Uint8Array): DetectedFileType {
  const b = (i: number) => head[i] ?? -1
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png'
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp'
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'application/pdf'
  // Text formats: skip a UTF-8 BOM and whitespace.
  let i = b(0) === 0xef && b(1) === 0xbb && b(2) === 0xbf ? 3 : 0
  while (i < head.length && [0x20, 0x09, 0x0a, 0x0d].includes(b(i))) i += 1
  if (b(i) === 0x7b || b(i) === 0x5b) return 'application/json'
  if (b(i) === 0x3c) return 'application/xml'
  // Plain text without binary bytes is treated as CSV candidate.
  const sample = head.slice(0, 512)
  if (sample.length > 0 && sample.every((c) => c === 0x09 || c === 0x0a || c === 0x0d || c >= 0x20)) return 'text/csv'
  return null
}

export async function readHead(file: Blob, bytes = 16): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, Math.max(bytes, 512)).arrayBuffer())
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type InvoiceFileCheck =
  | { ok: true; type: Exclude<DetectedFileType, null | 'text/csv'> }
  | { ok: false; reason: 'too-large' | 'unsupported-type' | 'empty' }

export async function checkInvoiceFile(file: File): Promise<InvoiceFileCheck> {
  if (file.size === 0) return { ok: false, reason: 'empty' }
  if (file.size > MAX_INVOICE_BYTES) return { ok: false, reason: 'too-large' }
  const type = sniffFileType(await readHead(file))
  if (!type || type === 'text/csv') return { ok: false, reason: 'unsupported-type' }
  return { ok: true, type }
}
