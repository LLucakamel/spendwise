import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { appRoutes } from '@/app/AppRoutes'
import { SessionContext, type Session } from '@/app/session'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DataProvider } from '@/data/DataProvider'
import { DemoRepository } from '@/data/demo/demoRepository'
import { DEFAULT_CATEGORIES, defaultSettings } from '@/domain/defaults'
import type { FinanceData } from '@/domain/types'
import { ThemeProvider } from '@/hooks/use-theme'
// Load the lazily-imported pages up front so tests don't race module loading.
import '@/features/analytics/AnalyticsPage'
import '@/features/budgets/BudgetsPage'
import '@/features/dashboard/DashboardPage'
import '@/features/recurring/RecurringPage'
import '@/features/settings/SettingsPage'
import '@/features/transactions/TransactionsPage'

export function emptyData(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    transactions: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })),
    budgets: [],
    recurringBills: [],
    settings: { ...defaultSettings('en-US'), displayCurrency: 'USD' },
    ...overrides,
  }
}

/** Renders the real application routes against an in-memory demo repository. */
export function renderApp(route: string, data: FinanceData = emptyData()) {
  const repository = new DemoRepository(data)
  const session: Session = {
    mode: 'demo',
    account: { kind: 'demo' },
    repository,
    signOut: async () => undefined,
    deleteAccount: () => repository.deleteAllData(),
    resetDemo: () => repository.resetToSample(),
  }
  const user = userEvent.setup()
  const result = render(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>
          <SessionContext.Provider value={session}>
            <DataProvider repository={repository}>
              <Routes>
                <Route path="/">{appRoutes()}</Route>
              </Routes>
            </DataProvider>
          </SessionContext.Provider>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
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
