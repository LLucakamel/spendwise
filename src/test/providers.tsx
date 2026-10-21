import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/hooks/use-theme'
import { I18nProvider } from '@/i18n'
import type { Language } from '@/domain/types'

/** The app-wide providers from main.tsx, for tests that render pages outside renderApp. */
export function TestProviders({ children, language = 'en' }: { children: ReactNode; language?: Language }) {
  return (
    <I18nProvider initial={language}>
      <ThemeProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}
