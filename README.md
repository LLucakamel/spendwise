# SpendWise

SpendWise is a personal finance web app for recording income and expenses, setting monthly budgets, tracking recurring bills and exploring spending analytics. It handles money as integer minor units, treats every currency separately, and keeps each user's data private behind Firebase Authentication and restrictive Firestore Security Rules.

![Dashboard](docs/screenshots/dashboard-light.png)

| Dark theme | Mobile |
| --- | --- |
| ![Dashboard, dark theme](docs/screenshots/dashboard-dark.png) | ![Dashboard on a phone](docs/screenshots/mobile-dashboard.png) |

More screens: [transactions](docs/screenshots/transactions.png) · [budgets](docs/screenshots/budgets.png) · [recurring bills](docs/screenshots/bills.png) · [analytics](docs/screenshots/analytics.png) · [settings](docs/screenshots/settings.png). All screenshots come from the demo build and show fictional data.

## Features

- **Dashboard**: income, expenses, net cash flow and current balance for the selected period (this month, last month, last 30/90 days, this year, or a custom range), compared with the previous equivalent period. Also shows an income-vs-expense chart, spending by category, budget usage, upcoming and overdue bills, and recent transactions.
- **Transactions**: create, edit and delete (with confirmation); search; filter by type, category, currency and date range; sort; paginate; view details; export the filtered list to CSV.
- **Multi-currency**: ISO 4217 codes with the correct minor units (JPY 0, USD 2, KWD 3, …), locale-aware formatting, and totals grouped by currency. Amounts in different currencies are never added together, and there is no currency conversion.
- **Budgets**: monthly limits per expense category and currency, active for a range of months. Shows spent, remaining and percentage used, with warnings at 80% and when over. Only matching expenses count, and overlapping budgets for the same category and currency are blocked so nothing is counted twice.
- **Recurring bills**: weekly, monthly, quarterly or yearly bills, with an optional end date. You can pause, resume, skip or delete a bill. **Mark paid** records exactly one expense for that occurrence and advances the due date. Month-end dates are handled correctly (Jan 31 → Feb 28 → Mar 31).
- **Analytics**: period comparison table, income vs expenses chart, spending trend, expenses by category, top categories against the previous period, monthly summary table, and totals by currency.
- **Settings**: light, dark or system theme; preferred display currency; language and region; date format; first day of the week; opening balances per currency; category management; CSV export; JSON backup and restore; sign-out; account deletion.
- **Accessibility and layout**: semantic landmarks, labelled form controls, keyboard-operable dialogs and menus, visible focus rings, a skip link, and status shown as icon plus text (never colour alone). Chart colours were checked for colour-vision deficiency. There is a sidebar on desktop and a bottom tab bar on phones, with no horizontal scrolling down to 320 px wide.

## Technology

React 19 · TypeScript 6 (strict) · Vite 8 · Tailwind CSS 4 · shadcn/ui (Radix UI) · React Router 8 · Firebase 13 (Authentication + Cloud Firestore) · Recharts 3 · React Hook Form + Zod 4 · date-fns 4 · Lucide icons · Vitest 5 + Testing Library · Playwright · Firebase Emulator Suite for rules tests.

## Prerequisites

- **Node.js 22.12 or newer** (24 LTS recommended; see `.nvmrc`). Several dependencies (React Router 8, Vitest 5, jsdom 30) no longer support Node 20.
- npm 10+.
- For `npm run test:rules` only: **Java 21+** on `PATH` (the Firestore emulator needs it).
- For `npm run test:e2e`: Microsoft Edge (used by default), or run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.

## Installation and local development

```bash
npm install
cp .env.example .env.local   # then fill in your Firebase web app values

npm run dev        # real app, Firebase mode   → http://localhost:5173
npm run dev:demo   # demo mode, no Firebase needed
```

## App modes

The mode is fixed at build time by `VITE_APP_MODE`:

| Mode | How | Data |
| --- | --- | --- |
| `firebase` (default) | `npm run dev`, `npm run build` | Real accounts. Data lives in Firestore under `users/{uid}/…`. |
| `demo` | `npm run dev:demo`, `npm run build:demo` (reads `.env.demo`) | Fictional sample data, stored only in the browser's `localStorage` under `spendwise.demo.v1`. |

- The demo build contains **no Firebase code**, and the account build contains **no demo data**. This was checked in the production bundles.
- Demo mode shows a permanent "Demo mode" banner and never uploads anything.
- If Firebase mode is missing its configuration, the app shows a "Firebase is not configured" screen. It never silently switches to demo data, including after an authentication or network failure.
- Demo controls are in Settings: **Reset sample data** and **Clear all demo data** (for trying the empty states).

## Environment variables

`.env.example` lists every variable, with placeholders only. Put real values in `.env.local`, which Git ignores.

| Variable | Purpose |
| --- | --- |
| `VITE_APP_MODE` | `firebase` or `demo` |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Firebase web app config |
| `VITE_USE_FIREBASE_EMULATORS` | `true` connects the dev server to local emulators (dev builds only) |

The Firebase web config identifies your project. It is **not a secret**, because security comes from Authentication and `firestore.rules`. Never commit service-account keys or admin credentials; the client doesn't need them.

## Firebase setup

1. Create a project at <https://console.firebase.google.com>.
2. **Add a Web app** (Project settings → Your apps → Web) and copy its config values into `.env.local`.
3. **Authentication** → Sign-in method → enable **Email/Password**. Under Settings → Authorized domains, add the domains you will host on (localhost is included by default). Optionally customise the password-reset and verification email templates.
4. **Firestore Database** → Create database (production mode), in a region close to your users.
5. Deploy the security rules and indexes:

   ```bash
   npx firebase login
   npx firebase use --add          # choose your project (writes .firebaserc, which Git ignores)
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```

On first sign-in the app creates `users/{uid}/settings/preferences` and the default categories for that user.

### Data model

```
users/{uid}/settings/preferences
users/{uid}/categories/{categoryId}
users/{uid}/transactions/{transactionId}   # bill payments use ID bill_{billId}_{dueDate}
users/{uid}/budgets/{budgetId}
users/{uid}/recurringBills/{billId}
```

Amounts are stored as positive integers in the currency's minor unit (`amountMinor`), with an ISO 4217 `currency`. Dates are `YYYY-MM-DD` calendar dates. `createdAt` and `updatedAt` are server timestamps.

### Security rules (`firestore.rules`)

- Only the signed-in owner (`request.auth.uid == uid`) can read or write `users/{uid}/…`. Everything else is denied, including the parent `users/{uid}` document and any unknown collection.
- Each record type is validated: exact field set, types, integer positive amounts within the app's limit, 3-letter currency codes, valid dates and months, enumerated values, and length limits.
- `createdAt` must equal the server time on create and can never change. `updatedAt` must be the server time on every update.
- A bill-payment expense must use the ID `bill_{billId}_{dueDate}`, so an occurrence can only be recorded once.

## Tests and build

```bash
npm run typecheck   # tsc, strict
npm run lint        # ESLint (typescript-eslint, React Hooks / React Compiler rules)
npm test            # Vitest: unit + component tests
npm run test:rules  # Firestore rules + repository integration tests on the emulators (Java 21+)
npm run test:e2e    # Playwright against a production demo build (desktop + mobile)
npm run build       # production build (Firebase mode) → dist/
npm run build:demo  # production build (demo mode)     → dist/
npm run check       # typecheck + lint + test + build
```

What is covered:

- **Unit tests**: money parsing and formatting across 0, 2 and 3 decimal currencies, integer sums and overflow, date ranges and boundaries, period comparisons, category breakdowns, multi-currency totals, balances, budget usage and overlap, recurring due dates (month ends, leap years), duplicate-payment detection, CSV escaping and formula-injection protection, backup validation, and transaction filtering.
- **Component tests**: transaction validation, single-submit creation, edit and delete, search and filters, dashboard totals updating, budget usage and overlap blocking, bill payment and pause/resume.
- **Emulator tests**: the security rules (isolation, validation, timestamp forgery, duplicate bill payments), plus the app's real `FirestoreRepository` running against the Auth and Firestore emulators.
- **End-to-end tests**: navigation, transaction CRUD with dashboard totals, filters, budgets, recurring bills, charts, theme and currency preferences, CSV export, empty states and invalid input, and mobile layout without horizontal overflow.

## Deployment

The app is a static single-page app; any static host works if it serves `index.html` for unknown paths. `firebase.json` is configured for **Firebase Hosting**:

```bash
npm run build
npx firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Add the hosting domain to Authentication → Authorized domains. To publish a public demo instead, run `npm run build:demo` and deploy `dist/` to any static host.

## Backup, export and account deletion

- **CSV export** (Transactions page or Settings): UTF-8 with BOM, RFC 4180 quoting, text fields starting with `= + - @` neutralised, and amounts as exact decimals in their own currency. Export from the Transactions page respects the active search and filters.
- **JSON backup** (Settings): settings, categories, transactions, budgets and bills. **Restore** validates the file, adds records and replaces records with the same ID (existing records not in the file are kept), then replaces preferences. Demo backups can't be restored into a real account. Backups happen only when you click the button; there is no automatic backup.
- **Delete account** (Settings): asks for the password, re-authenticates, deletes every document under `users/{uid}`, then deletes the Firebase Auth user. Because all data sits under the user's own path and the rules deny everyone else, nothing remains readable afterwards. Firestore backups or exports that you configure yourself are outside the app's control. For server-side cleanup when users are deleted from the Console, consider the official *Delete User Data* extension.

## Known limitations

- **No currency conversion.** Totals, charts and budgets are per currency, and a category with spending in several currencies needs one budget per currency.
- **No background reminders.** Due and overdue bills appear only when the app is open, and payments are never recorded automatically.
- **Offline:** Firestore uses an in-memory cache, so private data isn't written to disk on shared devices. Simple edits made offline are queued while the tab stays open. Marking a bill paid, skipping an occurrence and restoring a backup need a connection.
- All of a user's records load into memory. This suits personal-scale data (thousands of transactions); very large histories would need server-side paging.
- Theme is a per-device preference. Other preferences sync with the account.
- Email verification is sent and shown, but not required to use the app.
- No bank connections or payment processing, by design.

## Verification status

- Run locally on Windows 10 with Node 24.22 and Edge: type check, lint, unit/component tests, emulator rules/integration tests, Playwright e2e (desktop and mobile), and production builds of both modes.
- Firebase behaviour (registration, data access, rules) was verified **against the local Firebase emulators only**. No real Firebase project was configured, so production email delivery (verification and reset) and a deployed environment have not been tested.
- `npm audit` reports advisories in `@grpc/grpc-js`, which comes in through Firestore's Node.js build. It is not included in the browser bundle (checked). The suggested `--force` fix would downgrade Firebase.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Firebase is not configured" screen | Fill in the `VITE_FIREBASE_*` values in `.env.local` and restart `npm run dev`. |
| `auth/operation-not-allowed` | Enable Email/Password in Authentication → Sign-in method. |
| `auth/unauthorized-domain` or sign-in popups blocked | Add your domain under Authentication → Settings → Authorized domains. |
| "You don't have permission…" after signing in | Deploy `firestore.rules` to the same project as your `.env.local` config. |
| `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | Use npm 11+ (bundled with Node 24). |
| `test:rules` fails to start the emulator | Install Java 21+ and make sure `java -version` works in the same terminal. |
| Playwright can't find a browser | Install Microsoft Edge, or `npx playwright install chromium` and set `PW_CHANNEL=chromium`. |
| Reset the demo | Settings → Reset sample data, or clear the site's storage. |
