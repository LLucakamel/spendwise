import { onIdTokenChanged, updateProfile, type User } from 'firebase/auth'
import { Loader2Icon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataProvider } from '@/data/DataProvider'
import { getFirebaseServices, readFirebaseConfig } from '@/data/firebase/app'
import { deleteAccount, resendVerification, signOut } from '@/data/firebase/authService'
import { FirestoreRepository } from '@/data/firebase/firestoreRepository'
import { ForgotPasswordPage, LoginPage, RegisterPage } from '@/features/auth/AuthPages'
import { appRoutes } from './AppRoutes'
import { APP_BASE } from './mode'
import { SessionContext, type Session } from './session'

type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: User; version: number }

const AuthContext = createContext<AuthState>({ status: 'loading' })

/** Waits for Firebase to restore a saved session before any redirect decision is made. */
function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  useEffect(() => {
    const { auth: firebaseAuth } = getFirebaseServices()
    // onIdTokenChanged also fires after token refreshes (e.g. after a profile update), so profile
    // changes such as the display name reach the UI.
    return onIdTokenChanged(firebaseAuth, (user) =>
      setAuth(user ? { status: 'signed-in', user, version: Date.now() } : { status: 'signed-out' }),
    )
  }, [])
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" aria-busy="true">
      <Logo />
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

/** Shown when this deployment has no Firebase configuration. It never switches to demo data on its own. */
function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Logo className="mb-2" />
          <CardTitle>Accounts aren’t available on this deployment</CardTitle>
          <CardDescription>
            Sign-in and cloud storage need a Firebase project, and this build of SpendWise doesn’t have one configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div>
            <p className="mb-1 font-medium">For the site owner</p>
            <p className="text-muted-foreground">
              Set these build variables (see <code>.env.example</code> and the README), then rebuild:
            </p>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/demo">Try the demo instead</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function SignedInSession({ user, version, children }: { user: User; version: number; children: ReactNode }) {
  const { auth, db } = getFirebaseServices()
  const [profileVersion, setProfileVersion] = useState(0)
  // One repository per user; it can only address users/{uid} for this uid.
  const repository = useMemo(() => new FirestoreRepository(db, user.uid), [db, user.uid])
  const updateDisplayName = useCallback(
    async (name: string) => {
      await updateProfile(user, { displayName: name.trim() || null })
      setProfileVersion((v) => v + 1)
    },
    [user],
  )
  const session = useMemo<Session>(
    () => ({
      mode: 'firebase',
      account: {
        kind: 'firebase',
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        createdAt: user.metadata.creationTime ?? null,
      },
      repository,
      basePath: APP_BASE,
      signOut: () => signOut(auth),
      deleteAccount: (password: string) => deleteAccount(user, password, repository),
      resendVerification: () => resendVerification(user),
      updateDisplayName,
    }),
    // profileVersion re-reads the mutable User object after a profile update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth, user, repository, updateDisplayName, profileVersion, version],
  )
  return (
    <SessionContext.Provider value={session}>
      <DataProvider key={user.uid} repository={repository}>
        {children}
      </DataProvider>
    </SessionContext.Provider>
  )
}

function RequireAuth() {
  const auth = useContext(AuthContext)
  const location = useLocation()
  if (auth.status === 'loading') return <FullScreenLoader />
  if (auth.status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return (
    <SignedInSession user={auth.user} version={auth.version}>
      <Outlet />
    </SignedInSession>
  )
}

function PublicOnly() {
  const auth = useContext(AuthContext)
  const location = useLocation()
  if (auth.status === 'loading') return <FullScreenLoader />
  if (auth.status === 'signed-in') {
    // Return to the private page the visitor originally asked for, if any.
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from?.startsWith(APP_BASE) ? from : APP_BASE} replace />
  }
  return <Outlet />
}

/** Account area: /login, /register, /forgot-password and the private /app routes. */
export default function FirebaseArea() {
  const config = readFirebaseConfig()
  if (!config.ok) return <SetupRequired missing={config.missing} />
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="app" element={<RequireAuth />}>
          {appRoutes()}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
