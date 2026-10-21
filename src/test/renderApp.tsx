import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { appRoutes } from '@/app/AppRoutes'
import { SessionContext, type Session } from '@/app/session'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DataProvider } from '@/data/DataProvider'
import { DemoRepository } from '@/data/demo/demoRepository'
import { DEFAULT_CATEGORIES, defaultSettings } from '@/domain/defaults'
import type { FinanceData, Language } from '@/domain/types'
import { ThemeProvider } from '@/hooks/use-theme'
import { I18nProvider } from '@/i18n'

// Load the lazily-imported pages up front so tests don't race module loading.
import.meta.glob('/src/features/*/*Page.tsx', { eager: true })

export function emptyData(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })),
    budgets: [],
    recurringBills: [],
    accounts: [],
    incomeSources: [],
    invoices: [],
    imports: [],
    goals: [],
    debts: [],
    settings: { ...defaultSettings('en-US'), displayCurrency: 'USD' },
    ...overrides,
  }
}

export interface RenderAppOptions {
  /** Initial interface language (default: the data's settings.language, which the app layout then applies). */
  language?: Language
  /** Whether invoice files are treated as stored in the cloud (default false, as in the demo). */
  cloudFiles?: boolean
}

/** Renders the real application routes against an in-memory demo repository. */
export function renderApp(route: string, data: FinanceData = emptyData(), options: RenderAppOptions = {}) {
  const repository = new DemoRepository(data)
  const session: Session = {
    mode: 'demo',
    account: { kind: 'demo' },
    repository,
    basePath: '/demo',
    cloudFiles: options.cloudFiles ?? false,
    signOut: async () => undefined,
    deleteAccount: () => repository.deleteAllData(),
    resetDemo: () => repository.resetToSample(),
  }
  const user = userEvent.setup()
  const result = render(
    <I18nProvider initial={options.language ?? data.settings.language}>
      <ThemeProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[`/demo${route === '/' ? '' : route}`]}>
            <SessionContext.Provider value={session}>
              <DataProvider repository={repository}>
                <Routes>
                  <Route path="/demo">{appRoutes()}</Route>
                </Routes>
              </DataProvider>
            </SessionContext.Provider>
          </MemoryRouter>
        </TooltipProvider>
      </ThemeProvider>
    </I18nProvider>,
  )
  return { ...result, user, repository }
}

/** Latest data held by a repository (via a one-off subscription). */
export function snapshot(repository: DemoRepository): Promise<FinanceData> {
  return new Promise((resolve) => {
    const unsubscribe = repository.subscribe((data) => {
      queueMicrotask(() => unsubscribe())
      resolve(data)
    })
  })
}
