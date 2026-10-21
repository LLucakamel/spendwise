import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { LandingPage } from '@/features/landing/LandingPage'
import { PrivacyPage } from '@/features/landing/PrivacyPage'

// Each area loads on demand: visitors to the demo never download Firebase,
// and signed-in users never download the demo data generator.
const DemoArea = lazy(() => import('./DemoArea'))
const FirebaseArea = lazy(() => import('./FirebaseArea'))

/**
 * Hash-based routing (#/app/...) so every route survives a refresh on static hosts
 * such as GitHub Pages, which cannot rewrite unknown paths to index.html.
 */
export function Root() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="demo/*" element={<DemoArea />} />
          <Route path="*" element={<FirebaseArea />} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
