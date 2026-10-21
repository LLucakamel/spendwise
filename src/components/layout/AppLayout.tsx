import {
  ArrowLeftRightIcon,
  BarChart3Icon,
  CalendarClockIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  SettingsIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useSession } from '@/app/session'
import { ErrorState } from '@/components/common/states'
import { Skeleton } from '@/components/ui/skeleton'
import { useFinanceState } from '@/data/DataProvider'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'

interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboardIcon },
  { to: '/transactions', label: 'Transactions', short: 'Activity', icon: ArrowLeftRightIcon },
  { to: '/budgets', label: 'Budgets', short: 'Budgets', icon: PiggyBankIcon },
  { to: '/bills', label: 'Recurring bills', short: 'Bills', icon: CalendarClockIcon },
  { to: '/analytics', label: 'Analytics', short: 'Reports', icon: BarChart3Icon },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: SettingsIcon },
]

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-foreground">
      <FlaskConicalIcon className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span>
        <strong>Demo mode</strong> — fictional sample data, stored only in this browser. Nothing is sent to a server.
      </span>
    </div>
  )
}

function OfflineBanner() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-xs text-muted-foreground">
      <WifiOffIcon className="size-3.5" aria-hidden="true" />
      You’re offline. Changes made now will sync when the connection returns, as long as this tab stays open.
    </div>
  )
}

function AccountBadge() {
  const { account } = useSession()
  if (account.kind === 'demo') {
    return (
      <div className="rounded-lg border border-dashed border-warning/50 px-3 py-2 text-xs">
        <p className="font-medium">Demo visitor</p>
        <p className="text-muted-foreground">Not signed in</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border px-3 py-2 text-xs">
      <p className="text-muted-foreground">Signed in as</p>
      <p className="truncate font-medium" title={account.email ?? undefined}>
        {account.email}
      </p>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex-1 px-3 py-2">
        <ul className="grid gap-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )
                }
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-3">
        <AccountBadge />
      </div>
    </aside>
  )
}

function MobileNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[11px] font-medium outline-none focus-visible:bg-accent',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <item.icon className="size-5" aria-hidden="true" />
              <span className="truncate">{item.short}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your data" className="grid gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

export function AppLayout() {
  const { mode } = useSession()
  const { state, retry } = useFinanceState()
  const online = useOnline()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {mode === 'demo' ? <DemoBanner /> : null}
        {!online && mode === 'firebase' ? <OfflineBanner /> : null}
        <header className="flex h-14 items-center border-b px-4 lg:hidden">
          <Logo />
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">
          {state.status === 'ready' ? (
            <Suspense fallback={<LoadingSkeleton />}>
              <Outlet />
            </Suspense>
          ) : state.status === 'loading' ? (
            <LoadingSkeleton />
          ) : (
            <ErrorState
              title="We couldn’t load your data"
              description={friendlyError(state.error, 'Check your connection, then try again.')}
              onRetry={retry}
            />
          )}
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
