/*
 * SpendWise service worker.
 * Caches only the app's own static files so the interface opens offline.
 * It never intercepts cross-origin requests, so Firebase (accounts and financial records)
 * and exchange-rate API responses are never stored by it.
 */
const VERSION = 'v1'
const CACHE = `spendwise-static-${VERSION}`
const SCOPE = self.registration.scope // e.g. https://user.github.io/spendwise/
const SHELL = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}favicon.svg`, `${SCOPE}icon-192.png`, `${SCOPE}icon-512.png`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('spendwise-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !request.url.startsWith(SCOPE)) return

  // Pages: network first so deployments show up immediately; fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(SCOPE, response.clone()))
          return response
        })
        .catch(() => caches.match(SCOPE).then((cached) => cached ?? Response.error())),
    )
    return
  }

  // Build assets have content hashes in their names, so a cached copy is always correct.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
            return response
          }),
      ),
    )
    return
  }

  // Other static files (icons, manifest): network first, cache as fallback.
  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error())))
})
