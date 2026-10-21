import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

const ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

const REQUIRED: (keyof typeof ENV_KEYS)[] = ['apiKey', 'authDomain', 'projectId', 'appId']

export type FirebaseConfigStatus = { ok: true; options: FirebaseOptions } | { ok: false; missing: string[] }

function isPlaceholder(value: string): boolean {
  return value === '' || value.startsWith('your-') || /^0+$/.test(value) || value.includes('000000000000')
}

export function readFirebaseConfig(env: Record<string, string | undefined> = import.meta.env): FirebaseConfigStatus {
  const options: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, envName] of Object.entries(ENV_KEYS) as [keyof typeof ENV_KEYS, string][]) {
    const value = (env[envName] ?? '').trim()
    if (REQUIRED.includes(key) && isPlaceholder(value)) missing.push(envName)
    if (value) options[key] = value
  }
  return missing.length ? { ok: false, missing } : { ok: true, options }
}

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let services: FirebaseServices | null = null

/**
 * Initializes Firebase once. Firestore uses the default in-memory cache, so private
 * financial records are not persisted to disk on shared devices.
 */
export function getFirebaseServices(): FirebaseServices {
  if (services) return services
  const config = readFirebaseConfig()
  if (!config.ok) throw new Error('Firebase is not configured.')
  const app = initializeApp(config.options)
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  services = { app, auth, db }
  return services
}
