import { lazy } from 'react'
import { Route } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from './NotFoundPage'

// Pages load on demand so heavy libraries (charts, OCR, PDF) are only fetched where they are used.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const TransactionsPage = lazy(() => import('@/features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })))
const IncomePage = lazy(() => import('@/features/income/IncomePage').then((m) => ({ default: m.IncomePage })))
const InvoicesPage = lazy(() => import('@/features/invoices/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const AccountsPage = lazy(() => import('@/features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage').then((m) => ({ default: m.BudgetsPage })))
const RecurringPage = lazy(() => import('@/features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })))
const ToolsPage = lazy(() => import('@/features/tools/ToolsPage').then((m) => ({ default: m.ToolsPage })))
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

/** The signed-in (or demo) application routes, shared by both modes. */
export function appRoutes() {
  return (
    <Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="transactions" element={<TransactionsPage />} />
      <Route path="income" element={<IncomePage />} />
      <Route path="invoices" element={<InvoicesPage />} />
      <Route path="accounts" element={<AccountsPage />} />
      <Route path="budgets" element={<BudgetsPage />} />
      <Route path="bills" element={<RecurringPage />} />
      <Route path="tools" element={<ToolsPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  )
}
