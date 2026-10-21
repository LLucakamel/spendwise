export type AppMode = 'demo' | 'firebase'

/**
 * The mode is chosen by the route the visitor explicitly opens: /demo for the fictional
 * sandbox, /app (after signing in) for a real account. The app never switches from one
 * to the other on its own, e.g. after an authentication or network failure.
 */
export const DEMO_BASE = '/demo'
export const APP_BASE = '/app'
