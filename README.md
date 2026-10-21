# SpendWise

SpendWise is a personal finance web app. You record income and expenses in any currency, set monthly budgets, track recurring bills, search everything, and explore analytics that are calculated only from your own records.

- Real accounts use **Firebase Authentication and Cloud Firestore**, with restrictive security rules.
- A separate **demo mode** runs entirely in the browser with fictional data.
- The app is a static site built for **GitHub Pages**, with hash routing and a configurable base path.

![Dashboard](docs/screenshots/dashboard-light.png)

| Landing | Dark theme | Mobile |
| --- | --- | --- |
| ![Landing page](docs/screenshots/landing.png) | ![Dashboard in dark mode](docs/screenshots/dashboard-dark.png) | ![Dashboard on a phone](docs/screenshots/mobile-dashboard.png) |

More screens: [register](docs/screenshots/register.png) · [global search](docs/screenshots/search.png) · [transactions](docs/screenshots/transactions.png) · [budgets](docs/screenshots/budgets.png) · [recurring bills](docs/screenshots/bills.png) · [analytics](docs/screenshots/analytics.png) · [settings](docs/screenshots/settings.png) · [mobile landing](docs/screenshots/mobile-landing.png).

All screenshots come from the app's production build. The dashboards show fictional demo data.

## Features

- **Accounts**
  - Sign up with name, email and password, with a show/hide toggle, live password rules (8+ characters, a letter and a number) and a privacy-notice acknowledgement.
  - Sign in with "keep me signed in" (Firebase local vs. session persistence).
  - Password reset by email, with a confirmation that doesn't reveal whether the account exists.
  - Sign out, protected `/app` routes, and return to the requested page after signing in.
  - Edit your display name, verify your email, and delete your account with all its data.
- **Demo mode**
  - Entered only through "Try the demo" (`#/demo`).
  - Fictional, versioned sample data in `localStorage` (`spendwise.demo.v1`).
  - Fully editable, with reset, clear and exit controls. Demo data is never uploaded or mixed with accounts.
- **Dashboard**
  - Periods: this week, this month, last month, last 30 or 90 days, this year, or a custom range.
  - Income, expenses, net cash flow and balance, each labelled with its currency, plus a comparison with the previous equivalent period.
  - Income vs expenses chart, spending by category, budget usage, upcoming and overdue bills, and recent transactions.
  - Rule-based **insights** (top category, budgets near their limit, overdue bills, spending change, savings rate). These are plain calculations, not AI.
  - A three-step getting-started checklist for new users: currency, first transaction, first budget.
- **Transactions**
  - Create, view, edit, and delete with confirmation.
  - Search across description, notes and category.
  - Filters for type, category, currency, date range, minimum/maximum amount (in each record's own currency) and payment method, all combinable.
  - Sorting, pagination, filters kept while you navigate, category suggestions when nothing matches, and CSV export of the filtered list.
- **Global search** (Ctrl/⌘ K)
  - Finds transactions, categories, budgets and recurring bills, showing type, amount, category and date.
  - Opening a result goes to the right screen and record.
- **Multiple currencies**
  - All ISO 4217 currencies, stored as integer minor units with the correct precision (JPY 0, USD 2, KWD 3, …) and locale-aware formatting.
  - Different currencies are never added together implicitly.
- **Exchange rates** ([Frankfurter](https://frankfurter.dev), European Central Bank reference rates)
  - Converted totals are opt-in and display-only.
  - Each one shows the rate used, the rate date, the source and the time it was fetched, with a stale warning, a timeout, rate-limit handling and a cache.
  - No rates are ever invented. Stored amounts never change.
- **Budgets**: monthly limits per expense category and currency. Each shows spent, remaining and percentage used, with near-limit and over-budget states. Overlapping budgets are blocked, and expenses in other currencies are shown as excluded.
- **Recurring bills**
  - Weekly, monthly, quarterly or yearly, with search and a status filter.
  - Pause, resume, skip, edit and delete.
  - **Mark paid** records exactly one expense per occurrence. A payment history is kept for each bill, and month-end and leap-year dates are handled correctly.
- **Analytics**: period comparison, income vs expenses, spending trend, categories, top categories against the previous period, monthly summary, budget performance, recurring commitments, per-currency totals, and an optional converted total.
- **Settings**: theme (light, navy dark or system, with no flash on load); display currency, locale, date format and first day of the week; opening balances; categories; CSV export; JSON backup and validated restore; account controls.
- **PWA**: installable, with a service worker that caches only the app's own static files. It never caches Firebase or API responses.

## Technology

React 19 · TypeScript 6 (strict) · Vite 8 · Tailwind CSS 4 · shadcn/ui (Radix) · Lucide · React Router 8 (`HashRouter`) · Firebase 13 (Auth + Firestore) · Recharts 3 · React Hook Form + Zod 4 · date-fns 4 · Vitest 5 + Testing Library · Playwright · Firebase Emulator Suite.

## Requirements

- **Node.js 22.12+** (24 LTS recommended; see `.nvmrc`) and npm 10+. The lockfile is committed; use `npm ci` for reproducible installs.
- Optional: **Java 21+** for the Firebase emulator tests, and **Microsoft Edge** for Playwright. To use Playwright's own Chromium instead, run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:5173  → landing page; "Try the demo" works without Firebase
npm run dev:demo   # opens the demo directly
```

To use real accounts locally, copy `.env.example` to `.env.local`, fill in your Firebase web config, and restart.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Firebase web app config. This is public configuration, not secrets: security comes from Authentication and `firestore.rules`. |
| `VITE_BASE_PATH` | Deployment sub-path, e.g. `/spendwise/`. Defaults to `/`. The Pages workflow sets it automatically. |
| `VITE_USE_FIREBASE_EMULATORS` | `true` connects to local emulators. It is honoured only when the app is served from localhost. |

`.env*` files are ignored by Git except `.env.example` (placeholders) and `.env.emulator` (fake `demo-*` project for tests). Never put service-account keys or admin credentials in the client.

Without Firebase variables, the landing page and demo still work. Sign-in pages show an "Accounts aren't available on this deployment" screen; the app never silently switches to demo data.

## Firebase setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com) and **register a Web app**. Copy its config into `.env.local` (locally) or into repository variables (for Pages; see below).
2. **Authentication → Sign-in method → Email/Password: enable.**
3. **Authentication → Settings → Authorized domains:** add `localhost` (present by default) and your Pages host, e.g. `USERNAME.github.io`.
4. **Firestore Database → Create database** in production mode.
5. Deploy the rules:

   ```bash
   npx firebase login
   npx firebase use --add        # writes .firebaserc (git-ignored)
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```

6. Optional: customise the verification and password-reset email templates under Authentication → Templates.

Google sign-in is **not** implemented. It needs OAuth consent configuration that couldn't be set up or tested here. To add it, enable the Google provider in Firebase and use `signInWithPopup`.

### Data model

```
users/{uid}/settings/preferences            display currency, locale, date format, week start, opening balances
users/{uid}/categories/{categoryId}
users/{uid}/transactions/{transactionId}    bill payments use the ID bill_{billId}_{dueDate}
users/{uid}/budgets/{budgetId}
users/{uid}/recurringBills/{billId}
```

- Amounts are positive integers in the currency's minor unit (`amountMinor`), with an ISO 4217 `currency`.
- Dates are `YYYY-MM-DD`. `createdAt` and `updatedAt` are server timestamps.
- The transactions listener is bounded to the newest 5,000 records (`orderBy(date desc) + limit`). The UI says so if that limit is reached.

### Security rules (`firestore.rules`)

- Only the owner (`request.auth.uid == uid`) can read or write `users/{uid}/…`. Everything else is denied, including the parent document and unknown collections.
- Every write is validated: exact fields, types, integer amounts within limits, ISO currency codes, real dates and months, enumerated values, and lengths.
- `createdAt` must be the server time on create and can never change. `updatedAt` must be the server time on every write.
- A bill-payment expense must use the deterministic ID, so each occurrence can be recorded only once. Recording a payment and advancing the bill run in one Firestore transaction.

## Exchange rates

- Provider: **Frankfurter** (`https://api.frankfurter.dev/v1/latest`). It is free, needs no key, allows cross-origin requests from browsers, and publishes ECB reference rates on working days at around 16:00 CET. Those are reference rates, not live prices.
- Covered currencies (checked against the API): AUD, BRL, CAD, CHF, CNY, CZK, DKK, EUR, GBP, HKD, HUF, IDR, ILS, INR, ISK, JPY, KRW, MXN, MYR, NOK, NZD, PHP, PLN, RON, SEK, SGD, THB, TRY, USD, ZAR.
- **Not covered** include AED, SAR, EGP, KWD, QAR, JOD, BHD, OMR, PKR, BDT and NGN. Their totals stay separate and are listed as excluded from conversions.
- Requests contain only currency codes, never amounts. Results are cached per device (`spendwise.fx.v1.*`) and refreshed after 12 hours. They are flagged as stale if the publication is more than 4 days old.
- The client code is in `src/lib/exchangeRates.ts`; replacing the provider means changing that module.

## GitHub Pages deployment

`.github/workflows/deploy.yml` runs on pushes to `main` and on manual dispatch. It runs `npm ci`, typecheck, lint and unit tests, builds with `VITE_BASE_PATH=/<repo>/`, uploads `dist`, and deploys with the official Pages actions. It uses least-privilege permissions and the `github-pages` environment, and a failed check stops the deployment.

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Optional, to enable real accounts: **Settings → Secrets and variables → Actions → Variables** → add the six `VITE_FIREBASE_*` values. These are variables, not secrets, because they end up in the public bundle anyway.
3. Add `USERNAME.github.io` to Firebase **Authorized domains**.
4. Push to `main` or run the workflow. The site will be at `https://USERNAME.github.io/REPOSITORY/`.
5. To verify, open the site, register a test account, add a transaction, reload, sign out and sign in again.

Hash routing (`#/app/...`) means refreshing any page works on Pages without a 404 fallback.

GitHub Pages for **private** repositories requires a paid GitHub plan. On the free plan the repository must be public.

## Tests

| Command | What runs |
| --- | --- |
| `npm run typecheck` | `tsc -b` (strict) |
| `npm run lint` | ESLint with typescript-eslint and React Hooks / React Compiler rules |
| `npm test` | Vitest unit and component tests (jsdom) |
| `npm run test:coverage` | The same, with V8 coverage (text summary + `coverage/` HTML) |
| `npm run test:rules` | Firestore rules tests, plus the real `FirestoreRepository` against the Auth and Firestore emulators (needs Java 21+) |
| `npm run test:e2e` | Playwright on a production build served under `/spendwise/` (desktop + mobile): demo journeys, base-path assets, refresh on nested routes, service worker, search, filters, exchange rates (mocked success and failure), backup and restore |
| `npm run test:e2e:firebase` | Playwright on a production build against the Auth and Firestore emulators: registration, persistence across reloads, sign-out, protected routes, wrong password, return-to-page, cross-account isolation, password reset |
| `npm run build` | Production build into `dist/` |

## Backup and restore

- **CSV**: UTF-8 with BOM and RFC 4180 quoting. Text that a spreadsheet could treat as a formula is neutralised, and amounts are exact decimals in their own currency.
- **JSON backup** includes settings, categories, transactions, budgets and bills.
  - **Restore** validates the whole file (schema, references and limits) and shows a summary first.
  - Records are matched by ID, so restoring the same file twice doesn't duplicate anything. Existing records that aren't in the file are kept.
  - Demo backups can't be restored into a real account.
- Backups only happen when you click the button.

## Security notes

- Ownership is enforced server-side by the rules, not only in the UI, and the emulator tests prove that one user can't read or write another's records.
- Passwords are handled by Firebase only. The app stores no credentials. Logs contain no financial data; at most a malformed record's ID is logged.
- Firestore uses an in-memory cache, so financial data isn't written to disk on shared devices. The service worker ignores all cross-origin requests.
- There are no bank connections and no payment processing, by design.

## Known limitations

- Conversions use ECB reference rates (working days only) and exclude currencies the source doesn't cover.
- There are no background reminders or automatic payments: bills show up as due when you open the app.
- Offline, simple edits are queued while the tab stays open. Marking a bill paid, skipping an occurrence and restoring a backup need a connection.
- Search runs over the records already loaded (up to the newest 5,000 transactions). There is no server-side full-text index.
- Theme is a per-device preference. Other preferences sync with the account.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Accounts aren't available on this deployment" | Set the `VITE_FIREBASE_*` variables (`.env.local` or repository variables) and rebuild. |
| `auth/operation-not-allowed` | Enable Email/Password sign-in in Firebase. |
| `auth/unauthorized-domain` | Add the host (e.g. `USERNAME.github.io`) to Authorized domains. |
| "Your session needs attention" / permission denied | Deploy `firestore.rules` to the same project as the config. Signing in again refreshes the session. |
| Blank page or 404 for assets on Pages | `VITE_BASE_PATH` must match the repository name. The workflow sets it from `configure-pages`. |
| Converted total unavailable | The display currency or a record's currency isn't covered by Frankfurter, or the API is unreachable. Original totals remain. |
| `npm install` fails with `reading 'edgesOut'` | Use npm 11+ (bundled with Node 24). |
| Emulator tests fail to start | Install Java 21+ and check that `java -version` works in the same terminal. |
