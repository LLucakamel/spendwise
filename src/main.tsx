import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/hooks/use-theme'
import { I18nProvider } from '@/i18n'
import { moveFirebaseActionLinkIntoHash } from './app/actionLink'
import { Root } from './app/Root'
import { registerServiceWorker } from './pwa'
import './index.css'

moveFirebaseActionLinkIntoHash(window.location, window.history)

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found.')

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Root />
          <Toaster position="top-center" richColors={false} closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)

registerServiceWorker()
