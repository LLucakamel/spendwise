/**
 * Invoice files kept on this device only (IndexedDB), used by demo mode and by accounts whose
 * Firebase project has no Cloud Storage. Keys are namespaced ("demo/…" or "device/{uid}/…").
 * Falls back to memory when IndexedDB is unavailable (private windows, tests).
 */
const DB_NAME = 'spendwise-files'
const STORE = 'files'
const memory = new Map<string, Blob>()

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = fn(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function putLocalFile(key: string, blob: Blob): Promise<void> {
  memory.set(key, blob)
  await withStore('readwrite', (s) => s.put(blob, key)).catch(() => undefined)
}

export async function getLocalFile(key: string): Promise<Blob | null> {
  const stored = await withStore<Blob>('readonly', (s) => s.get(key)).catch(() => undefined)
  return stored ?? memory.get(key) ?? null
}

export async function deleteLocalFile(key: string): Promise<void> {
  memory.delete(key)
  await withStore('readwrite', (s) => s.delete(key)).catch(() => undefined)
}

/** Deletes every stored file whose key starts with `prefix`. */
export async function clearLocalFiles(prefix: string): Promise<void> {
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key)
  const keys = (await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).catch(() => undefined)) ?? []
  for (const key of keys) if (String(key).startsWith(prefix)) await withStore('readwrite', (s) => s.delete(key)).catch(() => undefined)
}
