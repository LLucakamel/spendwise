import { ArrowRightIcon, CoinsIcon, FlaskConicalIcon, LockIcon, ReceiptTextIcon, TrendingUpIcon, WalletCardsIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { LanguageThemeToggles } from '@/components/layout/PublicHeader'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { readFirebaseConfig } from '@/data/firebase/config'
import { useI18n, type MessageKey } from '@/i18n'

const FEATURES: { icon: LucideIcon; title: MessageKey; text: MessageKey }[] = [
  { icon: TrendingUpIcon, title: 'landing.f1Title', text: 'landing.f1Text' },
  { icon: ReceiptTextIcon, title: 'landing.f2Title', text: 'landing.f2Text' },
  { icon: CoinsIcon, title: 'landing.f3Title', text: 'landing.f3Text' },
  { icon: WalletCardsIcon, title: 'landing.f4Title', text: 'landing.f4Text' },
]

export function LandingPage() {
  const { t } = useI18n()
  const accountsAvailable = readFirebaseConfig().ok
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Logo />
        <nav aria-label={t('header.account')} className="flex items-center gap-1 sm:gap-2">
          <LanguageThemeToggles />
          {accountsAvailable ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">{t('landing.signIn')}</Link>
              </Button>
              <Button asChild className="hidden sm:inline-flex">
                <Link to="/register">{t('landing.createAccount')}</Link>
              </Button>
            </>
          ) : null}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden="true" /> {t('landing.badge')}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t('landing.title')}</h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">{t('landing.subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {accountsAvailable ? (
              <Button size="lg" asChild>
                <Link to="/register">
                  {t('landing.getStarted')} <ArrowRightIcon className="rtl:-scale-x-100" />
                </Link>
              </Button>
            ) : null}
            <Button size="lg" variant={accountsAvailable ? 'outline' : 'default'} asChild>
              <Link to="/demo">
                <FlaskConicalIcon /> {t('landing.tryDemo')}
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('landing.demoNote')}
            {accountsAvailable ? null : ` ${t('landing.noAccounts')}`}
          </p>
        </section>

        <section aria-labelledby="features-heading" className="border-t bg-card/50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="features-heading" className="sr-only">
              {t('landing.features')}
            </h2>
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold">{t(f.title)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(f.text)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-8 text-xs text-muted-foreground sm:px-6">
        <span>{t('landing.footer')}</span>
        <Link to="/privacy" className="underline-offset-4 hover:underline">
          {t('landing.privacy')}
        </Link>
      </footer>
    </div>
  )
}
