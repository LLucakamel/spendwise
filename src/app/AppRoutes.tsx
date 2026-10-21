import { lazy } from 'react'
import { Route } from 'react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotFoundPage } from './NotFoundPage'

// Pages load on demand so the charting library is only fetched where it is used.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const TransactionsPage = lazy(() => import('@/features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })))
const BudgetsPage = lazy(() => import('@/features/budgets/BudgetsPage').then((m) => ({ default: m.BudgetsPage })))
const RecurringPage = lazy(() => import('@/features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })))
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

/** The signed-in (or demo) application routes, shared by both modes. */
export function appRoutes() {
  return (
    <Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="transactions" element={<TransactionsPage />} />
      <Route path="budgets" element={<BudgetsPage />} />
      <Route path="bills" element={<RecurringPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  )
}
