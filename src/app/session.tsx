import { createContext, useContext } from 'react'
import type { DataRepository } from '@/data/repository'
import type { AppMode } from './mode'

export type Account =
  | { kind: 'demo' }
  | {
      kind: 'firebase'
      uid: string
      email: string | null
      emailVerified: boolean
      createdAt: string | null
    }

export interface Session {
  mode: AppMode
  account: Account
  repository: DataRepository
  signOut(): Promise<void>
  /** Firebase: deletes all data and the account (password required). Demo: empties the demo sandbox. */
  deleteAccount(password: string): Promise<void>
  resendVerification?: () => Promise<void>
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
