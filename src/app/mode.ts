export type AppMode = 'demo' | 'firebase'

/**
 * Chosen at build time from VITE_APP_MODE. Anything other than "demo" means the real,
 * Firebase-backed app; a missing Firebase configuration shows a setup screen instead of
 * silently switching to demo data.
 */
export const APP_MODE: AppMode = import.meta.env.VITE_APP_MODE === 'demo' ? 'demo' : 'firebase'
