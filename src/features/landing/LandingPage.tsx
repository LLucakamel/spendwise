import {
  ArrowRightIcon,
  BarChart3Icon,
  CalendarClockIcon,
  CoinsIcon,
  FlaskConicalIcon,
  LockIcon,
  PiggyBankIcon,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { readFirebaseConfig } from '@/data/firebase/config'

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CoinsIcon, title: 'Every currency, kept honest', text: 'Record amounts in any ISO currency. Totals stay separate per currency unless you choose a dated, sourced conversion.' },
  { icon: PiggyBankIcon, title: 'Budgets that add up', text: 'Monthly limits per category, calculated from the expenses you actually record, with clear warnings near the limit.' },
  { icon: CalendarClockIcon, title: 'Bills without surprises', text: 'See what’s due and overdue. Mark a bill paid and SpendWise records exactly one expense — never a duplicate.' },
  { icon: BarChart3Icon, title: 'Analytics from your data', text: 'Trends, categories and period comparisons computed from your transactions. No estimates, no made-up numbers.' },
]

export function LandingPage() {
  const accountsAvailable = readFirebaseConfig().ok
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          {accountsAvailable ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild className="hidden sm:inline-flex">
                <Link to="/register">Create account</Link>
              </Button>
            </>
          ) : null}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden="true" /> Private by design · your data, your account
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Know where your money goes — and where it’s going next.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
            SpendWise brings your income, expenses, budgets and recurring bills together in one calm, fast place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {accountsAvailable ? (
              <Button size="lg" asChild>
                <Link to="/register">
                  Get started free <ArrowRightIcon />
                </Link>
              </Button>
            ) : null}
            <Button size="lg" variant={accountsAvailable ? 'outline' : 'default'} asChild>
              <Link to="/demo">
                <FlaskConicalIcon /> Try the demo
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            The demo uses fictional data saved only in your browser — no account needed.
            {accountsAvailable ? null : ' Account sign-up isn’t configured on this deployment.'}
          </p>
        </section>

        <section aria-labelledby="features-heading" className="border-t bg-card/50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="features-heading" className="sr-only">
              Features
            </h2>
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-8 text-xs text-muted-foreground sm:px-6">
        <span>SpendWise — personal finance tracking. No bank connections, no payments.</span>
        <Link to="/privacy" className="underline-offset-4 hover:underline">
          Privacy notice
        </Link>
      </footer>
    </div>
  )
}
