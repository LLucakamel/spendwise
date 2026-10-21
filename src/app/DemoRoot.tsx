import { useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DataProvider } from '@/data/DataProvider'
import { DemoRepository } from '@/data/demo/demoRepository'
import { appRoutes } from './AppRoutes'
import { SessionContext, type Session } from './session'

/** Demo mode: no sign-in, fictional data in this browser only, no Firebase code loaded. */
export default function DemoRoot() {
  const [repository] = useState(() => new DemoRepository())
  const session = useMemo<Session>(
    () => ({
      mode: 'demo',
      account: { kind: 'demo' },
      repository,
      signOut: async () => undefined,
      deleteAccount: () => repository.deleteAllData(),
      resetDemo: () => repository.resetToSample(),
    }),
    [repository],
  )

  return (
    <BrowserRouter>
      <SessionContext.Provider value={session}>
        <DataProvider repository={repository}>
          <Routes>
            {['/login', '/register', '/forgot-password'].map((path) => (
              <Route key={path} path={path} element={<Navigate to="/" replace />} />
            ))}
            <Route path="/">{appRoutes()}</Route>
          </Routes>
        </DataProvider>
      </SessionContext.Provider>
    </BrowserRouter>
  )
}
