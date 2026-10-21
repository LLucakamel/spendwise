import type { FirebaseOptions } from 'firebase/app'

/** Reads the Firebase web config from build-time variables. No Firebase SDK code is loaded here. */
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

