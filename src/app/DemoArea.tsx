import { useMemo, useState } from 'react'
import { Route, Routes } from 'react-router'
import { DataProvider } from '@/data/DataProvider'
import { DemoRepository } from '@/data/demo/demoRepository'
import { appRoutes } from './AppRoutes'
import { DEMO_BASE } from './mode'
import { SessionContext, type Session } from './session'

/**
 * Demo mode, entered only through the explicit "Try the demo" link (/demo).
 * Fictional data lives in this browser's localStorage and IndexedDB; this module has no Firebase code.
 */
export default function DemoArea() {
  const [repository] = useState(() => new DemoRepository())
  const session = useMemo<Session>(
    () => ({
      mode: 'demo',
      account: { kind: 'demo' },
      repository,
      basePath: DEMO_BASE,
      cloudFiles: false,
      signOut: async () => undefined,
      deleteAccount: () => repository.deleteAllData(),
      resetDemo: () => repository.resetToSample(),
    }),
    [repository],
  )

  return (
    <SessionContext.Provider value={session}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/">{appRoutes()}</Route>
        </Routes>
      </DataProvider>
    </SessionContext.Provider>
  )
}
