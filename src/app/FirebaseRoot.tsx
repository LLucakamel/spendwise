import { onAuthStateChanged, type User } from 'firebase/auth'
import { Loader2Icon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataProvider } from '@/data/DataProvider'
import { getFirebaseServices, readFirebaseConfig } from '@/data/firebase/app'
import { deleteAccount, resendVerification, signOut } from '@/data/firebase/authService'
import { FirestoreRepository } from '@/data/firebase/firestoreRepository'
import { ForgotPasswordPage, LoginPage, RegisterPage } from '@/features/auth/AuthPages'
import { appRoutes } from './AppRoutes'
import { SessionContext, type Session } from './session'

type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: User }

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" aria-busy="true">
      <Logo />
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

/** Shown when the Firebase build has no configuration. It never falls back to demo data. */
function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Logo className="mb-2" />
          <CardTitle>Firebase is not configured</CardTitle>
          <CardDescription>
            This build of SpendWise runs in account mode but is missing its Firebase settings, so sign-in and data storage are unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>Add these values to a <code>.env.local</code> file (see <code>.env.example</code> and the README), then restart or rebuild:</p>
          <ul className="list-disc pl-5 font-mono text-xs">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            To explore SpendWise without Firebase, run the separate demo build with <code>npm run dev:demo</code>.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

function SignedInSession({ user, children }: { user: User; children: ReactNode }) {
  const { auth, db } = getFirebaseServices()
  // One repository per user; it can only address users/{uid} for this uid.
  const repository = useMemo(() => new FirestoreRepository(db, user.uid), [db, user.uid])
  const session = useMemo<Session>(
    () => ({
      mode: 'firebase',
      account: {
        kind: 'firebase',
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.metadata.creationTime ?? null,
      },
      repository,
      signOut: () => signOut(auth),
      deleteAccount: (password: string) => deleteAccount(user, password, repository),
      resendVerification: () => resendVerification(user),
    }),
    [auth, user, repository],
  )
  return (
    <SessionContext.Provider value={session}>
      <DataProvider key={user.uid} repository={repository}>
        {children}
      </DataProvider>
    </SessionContext.Provider>
  )
}

function RequireAuth({ auth }: { auth: AuthState }) {
  const location = useLocation()
  if (auth.status === 'loading') return <FullScreenLoader />
  if (auth.status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return (
    <SignedInSession user={auth.user}>
      <Outlet />
    </SignedInSession>
  )
}

function PublicOnly({ auth }: { auth: AuthState }) {
  if (auth.status === 'loading') return <FullScreenLoader />
  if (auth.status === 'signed-in') return <Navigate to="/" replace />
  return <Outlet />
}

function FirebaseApp() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  useEffect(() => {
    const { auth: firebaseAuth } = getFirebaseServices()
    return onAuthStateChanged(firebaseAuth, (user) => setAuth(user ? { status: 'signed-in', user } : { status: 'signed-out' }))
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnly auth={auth} />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="/" element={<RequireAuth auth={auth} />}>
          {appRoutes()}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function FirebaseRoot() {
  const config = readFirebaseConfig()
  if (!config.ok) return <SetupRequired missing={config.missing} />
  return <FirebaseApp />
}
