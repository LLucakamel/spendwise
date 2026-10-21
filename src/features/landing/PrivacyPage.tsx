import { Link } from 'react-router'
import { Logo } from '@/components/layout/Logo'

/** Plain-language description of what SpendWise stores and sends. Kept in sync with the implementation. */
export function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link to="/" aria-label="SpendWise home">
        <Logo />
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Privacy notice</h1>
      <div className="mt-4 grid gap-4 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-2 [&_h2]:font-semibold [&_h2]:text-foreground">
        <h2>What an account stores</h2>
        <p>
          Your email address, an optional display name, and the financial records you enter (transactions, budgets, recurring bills, categories
          and preferences). Records are stored in Google Firebase (Authentication and Cloud Firestore) under your account and are readable only
          by you, enforced by server-side security rules.
        </p>
        <h2>What SpendWise does not do</h2>
        <p>
          It does not connect to bank accounts, process payments, sell data, show ads or use analytics trackers. Passwords are handled by Firebase
          Authentication and are never stored by the app.
        </p>
        <h2>Exchange rates</h2>
        <p>
          When you ask for a converted total, the app requests reference rates from the public Frankfurter API (European Central Bank data). The
          request contains only currency codes — never your amounts or records.
        </p>
        <h2>Demo mode</h2>
        <p>Demo data is fictional and saved only in your browser’s local storage. It is never uploaded.</p>
        <h2>Your control</h2>
        <p>
          You can export your data (CSV or a full JSON backup) and permanently delete your account and all of its records from Settings at any
          time.
        </p>
      </div>
      <p className="mt-8 text-sm">
        <Link to="/" className="font-medium text-primary hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  )
}
