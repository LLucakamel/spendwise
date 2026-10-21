import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/hooks/use-theme'
import './index.css'

// The env value is inlined at build time, so only the selected mode's code is bundled:
// the demo build contains no Firebase code and the account build contains no demo data.
const Root =
  import.meta.env.VITE_APP_MODE === 'demo' ? lazy(() => import('./app/DemoRoot')) : lazy(() => import('./app/FirebaseRoot'))

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found.')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <Suspense fallback={null}>
          <Root />
        </Suspense>
        <Toaster position="top-center" richColors={false} closeButton />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
