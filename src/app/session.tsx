import { createContext, useCallback, useContext } from 'react'
import type { DataRepository } from '@/data/repository'
import type { AppMode } from './mode'

export type Account =
  | { kind: 'demo' }
  | {
      kind: 'firebase'
      uid: string
      email: string | null
      displayName: string | null
      emailVerified: boolean
      createdAt: string | null
    }

export interface Session {
  mode: AppMode
  account: Account
  repository: DataRepository
  /** Route prefix of the signed-in or demo area: "/app" or "/demo". */
  basePath: string
  /** True when invoice files are stored in Cloud Storage; otherwise they stay on this device. */
  cloudFiles: boolean
  signOut(): Promise<void>
  /** Firebase: deletes all data and the account (password required). Demo: empties the demo sandbox. */
  deleteAccount(password: string): Promise<void>
  resendVerification?: () => Promise<void>
  updateDisplayName?: (name: string) => Promise<void>
  /** Demo only: restores the fictional sample data. */
  resetDemo?: () => Promise<void>
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside a signed-in or demo session.')
  return session
}

export function useRepository(): DataRepository {
  return useSession().repository
}

/** Builds a link inside the current area, e.g. appPath('/budgets') → "/demo/budgets". */
export function useAppPath() {
  const { basePath } = useSession()
  return useCallback((path: string) => (path === '/' ? basePath : `${basePath}${path}`), [basePath])
}
