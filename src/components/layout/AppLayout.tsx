import {
  ArrowLeftRightIcon,
  BarChart3Icon,
  CalendarClockIcon,
  CompassIcon,
  FlaskConicalIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TrendingUpIcon,
  UserIcon,
  WalletCardsIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAppPath, useSession } from '@/app/session'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFinanceState } from '@/data/DataProvider'
import type { Language } from '@/domain/types'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { useTheme } from '@/hooks/use-theme'
import { useI18n, type MessageKey } from '@/i18n'
import { errorCode, errorKey } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'

interface NavItem {
  to: string
  label: MessageKey
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboardIcon },
  { to: '/transactions', label: 'nav.transactions', icon: ArrowLeftRightIcon },
  { to: '/income', label: 'nav.income', icon: TrendingUpIcon },
  { to: '/invoices', label: 'nav.invoices', icon: ReceiptTextIcon },
  { to: '/accounts', label: 'nav.accounts', icon: WalletCardsIcon },
  { to: '/budgets', label: 'nav.budgets', icon: PiggyBankIcon },
  { to: '/bills', label: 'nav.bills', icon: CalendarClockIcon },
  { to: '/tools', label: 'nav.tools', icon: CompassIcon },
  { to: '/analytics', label: 'nav.analytics', icon: BarChart3Icon },
  { to: '/settings', label: 'nav.settings', icon: SettingsIcon },
]

/** Phones show the four most used sections plus "More". */
const MOBILE_PRIMARY: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: '/', label: 'nav.short.dashboard', icon: LayoutDashboardIcon },
  { to: '/transactions', label: 'nav.short.transactions', icon: ArrowLeftRightIcon },
  { to: '/income', label: 'nav.short.income', icon: TrendingUpIcon },
  { to: '/invoices', label: 'nav.short.invoices', icon: ReceiptTextIcon },
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

function Banner({ tone, icon: Icon, children }: { tone: 'warning' | 'muted'; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs',
        tone === 'warning' ? 'border-b border-warning/30 bg-warning-soft font-medium text-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {Icon ? <Icon className={cn('size-3.5 shrink-0', tone === 'warning' && 'text-warning')} aria-hidden="true" /> : null}
      {children}
    </div>
  )
}

function navClass(isActive: boolean, compact = false) {
  return cn(
    'flex items-center rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50',
    compact ? 'size-10 justify-center' : 'gap-3 px-3 py-2',
    isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  )
}

/** Desktop: full sidebar. Tablet: icon rail with tooltips. */
function Sidebar() {
  const appPath = useAppPath()
  const { t } = useI18n()
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link to={appPath('/')} aria-label={t('nav.dashboard')} className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Logo />
          </Link>
        </div>
        <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="grid gap-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={appPath(item.to)} end={item.to === '/'} className={({ isActive }) => navClass(isActive)}>
                  <item.icon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                  {t(item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center border-e border-sidebar-border bg-sidebar py-3 md:flex lg:hidden">
        <Link to={appPath('/')} aria-label={t('nav.dashboard')} className="mb-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo iconOnly />
        </Link>
        <nav aria-label={t('nav.main')}>
          <ul className="grid gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink to={appPath(item.to)} end={item.to === '/'} aria-label={t(item.label)} className={({ isActive }) => navClass(isActive, true)}>
                      <item.icon className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t(item.label)}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  )
}

/** Phones: bottom tab bar with a "More" sheet for the remaining sections. */
function MobileNav() {
  const appPath = useAppPath()
  const { t } = useI18n()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const secondary = NAV_ITEMS.filter((item) => !MOBILE_PRIMARY.some((p) => p.to === item.to))
  const onSecondary = secondary.some((item) => location.pathname.startsWith(appPath(item.to)))
  return (
    <>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_PRIMARY.map((item) => (
            <li key={item.to}>
              <NavLink
                to={appPath(item.to)}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium outline-none focus-visible:bg-accent', isActive ? 'text-primary' : 'text-muted-foreground')
                }
              >
                <item.icon className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                <span className="truncate">{t(item.label)}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn('flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium outline-none focus-visible:bg-accent', onSecondary ? 'text-primary' : 'text-muted-foreground')}
            >
              <MenuIcon className="size-5" aria-hidden="true" />
              <span>{t('nav.short.more')}</span>
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle>{t('nav.more')}</SheetTitle>
            <SheetDescription className="sr-only">{t('nav.main')}</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-3 gap-2 px-4">
            {secondary.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={appPath(item.to)}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn('flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', isActive ? 'border-primary bg-primary/5 text-primary' : 'text-foreground')
                  }
                >
                  <item.icon className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                  {t(item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

function HeaderControls({ onSearch }: { onSearch(): void }) {
  const session = useSession()
  const appPath = useAppPath()
  const navigate = useNavigate()
  const { t, language, setLanguage } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()

  const switchLanguage = () => {
    const next: Language = language === 'ar' ? 'en' : 'ar'
    setLanguage(next)
    // Saved per user (or per demo sandbox) as well as on this device.
    session.repository.updateSettings({ language: next }).catch(() => undefined)
  }
  const account = session.account

  return (
    <div className="ms-auto flex items-center gap-1 sm:gap-2">
      <Button variant="outline" className="h-9 w-9 justify-start gap-2 px-0 text-muted-foreground sm:w-56 sm:px-3" onClick={onSearch} aria-label={t('header.searchEverything')} aria-keyshortcuts="Control+K">
        <SearchIcon className="mx-auto sm:mx-0" />
        <span className="hidden sm:inline">{t('header.search')}</span>
        <kbd className="ms-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline" dir="ltr">
          Ctrl K
        </kbd>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" aria-label={t('header.quickAdd')}>
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('header.quickAdd')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => navigate(`${appPath('/transactions')}?new=expense`)}>{t('header.addExpense')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`${appPath('/transactions')}?new=income`)}>{t('header.addIncome')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`${appPath('/transactions')}?new=transfer`)}>{t('header.addTransfer')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`${appPath('/invoices')}?new=1`)}>{t('header.addInvoice')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={switchLanguage} aria-label={t('header.language')} lang={language === 'ar' ? 'en' : 'ar'}>
        <LanguagesIcon className="hidden sm:block" aria-hidden="true" />
        {language === 'ar' ? t('header.switchToEnglish') : t('header.switchToArabic')}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label={resolvedTheme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
      >
        {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('header.account')}>
            {account.kind === 'demo' ? <FlaskConicalIcon className="text-warning" /> : <UserIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            {account.kind === 'demo' ? (
              <>
                <p className="font-medium">{t('header.demoVisitor')}</p>
                <p className="text-xs text-muted-foreground">{t('header.notSignedIn')}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('header.signedInAs')}</p>
                <p className="truncate font-medium">{account.displayName || account.email}</p>
                {account.displayName ? <p className="truncate text-xs text-muted-foreground">{account.email}</p> : null}
              </>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate(appPath('/settings'))}>
            <SettingsIcon /> {t('header.settings')}
          </DropdownMenuItem>
          {account.kind === 'demo' ? (
            <DropdownMenuItem onSelect={() => navigate('/')}>
              <LogOutIcon className="rtl:-scale-x-100" /> {t('header.exitDemo')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void session.signOut()}>
              <LogOutIcon className="rtl:-scale-x-100" /> {t('header.signOut')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function LoadingSkeleton() {
  const { t } = useI18n()
  return (
    <div aria-busy="true" aria-label={t('banners.loading')} className="grid gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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
  const session = useSession()
  const { state, retry } = useFinanceState()
  const { t, setLanguage } = useI18n()
  const online = useOnline()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const languageSynced = useRef(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // The account's (or demo sandbox's) saved language wins once per session.
  useEffect(() => {
    if (languageSynced.current || state.status !== 'ready') return
    languageSynced.current = true
    setLanguage(state.data.settings.language)
  }, [state, setLanguage])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const code = state.status === 'error' ? errorCode(state.error) : null
  const sessionProblem = code === 'permission-denied' || code === 'unauthenticated'

  return (
    <div className="flex min-h-dvh">
      {/* A button rather than an anchor: "#main" would be read as a route by the hash router. */}
      <button
        type="button"
        onClick={() => document.getElementById('main')?.focus()}
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        {t('common.skipToContent')}
      </button>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {session.mode === 'demo' ? (
          <Banner tone="warning" icon={FlaskConicalIcon}>
            <span>{t('banners.demo')}</span>
            <Link to="/" className="underline underline-offset-2 hover:no-underline">
              {t('header.exitDemo')}
            </Link>
          </Banner>
        ) : null}
        {!online && session.mode === 'firebase' ? (
          <Banner tone="muted" icon={WifiOffIcon}>
            {t('banners.offline')}
          </Banner>
        ) : null}
        {state.data?.transactionLimitReached ? <Banner tone="warning">{t('banners.limit')}</Banner> : null}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-6 lg:px-8">
          <Logo className="md:hidden" iconOnly />
          <HeaderControls onSearch={() => setSearchOpen(true)} />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 md:pb-10 lg:px-8">
          {state.status === 'ready' ? (
            <Suspense fallback={<LoadingSkeleton />}>
              <Outlet />
            </Suspense>
          ) : state.status === 'loading' ? (
            <LoadingSkeleton />
          ) : sessionProblem ? (
            <div className="grid justify-items-center">
              <ErrorState title={t('banners.sessionTitle')} description={t('banners.sessionText')} />
              <Button onClick={() => void session.signOut()}>
                <LogOutIcon className="rtl:-scale-x-100" /> {t('banners.signInAgain')}
              </Button>
            </div>
          ) : (
            <ErrorState title={t('banners.loadErrorTitle')} description={t(errorKey(state.error, 'banners.loadErrorText'))} onRetry={retry} />
          )}
        </main>
      </div>
      <MobileNav />
      {state.status === 'ready' ? <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} /> : null}
    </div>
  )
}
