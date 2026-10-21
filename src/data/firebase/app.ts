import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { readFirebaseConfig } from './config'

export { readFirebaseConfig } from './config'

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
  // Emulators are opt-in and only honoured on a local origin, so a misconfigured public build
  // can never point real users at localhost.
  const local = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && local) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  services = { app, auth, db }
  return services
}
