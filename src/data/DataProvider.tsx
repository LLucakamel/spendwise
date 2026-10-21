import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { FinanceData } from '@/domain/types'
import type { DataRepository } from './repository'

export type FinanceState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: FinanceData; error: null }
  | { status: 'error'; data: FinanceData | null; error: unknown }

interface FinanceContextValue {
  state: FinanceState
  retry(): void
}

const FinanceContext = createContext<FinanceContextValue | null>(null)

export function DataProvider({ repository, children }: { repository: DataRepository; children: ReactNode }) {
  const [state, setState] = useState<FinanceState>({ status: 'loading', data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const unsubscribe = repository.subscribe(
      (data) => setState({ status: 'ready', data, error: null }),
      (error) => setState((previous) => ({ status: 'error', data: previous.data, error })),
    )
    return unsubscribe
  }, [repository, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading', data: null, error: null })
    setAttempt((n) => n + 1)
  }, [])

  return <FinanceContext.Provider value={{ state, retry }}>{children}</FinanceContext.Provider>
}

export function useFinanceState(): FinanceContextValue {
  const value = useContext(FinanceContext)
  if (!value) throw new Error('useFinanceState must be used inside DataProvider.')
  return value
}

/** Finance data for components rendered after the data gate in the app layout. */
export function useFinance(): FinanceData {
  const { state } = useFinanceState()
  if (!state.data) throw new Error('Finance data is not loaded yet.')
  return state.data
}
