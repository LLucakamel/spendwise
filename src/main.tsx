import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/hooks/use-theme'
import { Root } from './app/Root'
import { registerServiceWorker } from './pwa'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found.')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <Root />
        <Toaster position="top-center" richColors={false} closeButton />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)

registerServiceWorker()
