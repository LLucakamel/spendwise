/**
 * Registers the static-asset service worker in production builds only.
 * The worker lives at the deployment base path (e.g. /spendwise/sw.js) and its scope is that path.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      // The app works without offline support; nothing to report to the user.
    })
  })
}
