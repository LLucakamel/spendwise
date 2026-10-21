import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Account, IncomeSource } from '@/domain/types'
import { todayIso } from '@/lib/dates'
import { tx } from '@/test/factories'
import { emptyData, renderApp } from '@/test/renderApp'

function statValue(title: RegExp) {
  const label = screen.getByText(title)
  const card = label.closest('[data-slot="card"]') as HTMLElement
  return within(card).getByText(/\$/).textContent
}

const stamp = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

function card(overrides: Partial<Account> = {}): Account {
  return {
    id: 'visa',
    name: 'Visa',
    kind: 'credit-card',
    provider: '',
    currency: 'USD',
    openingBalanceMinor: -50000,
    last4: '',
    syncMode: 'manual',
    creditLimitMinor: 200000,
    statementDay: null,
    paymentDueDay: null,
    minimumPaymentMinor: null,
    archived: false,
    notes: '',
    ...stamp,
    ...overrides,
  }
}

function salary(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 'salary',
    name: 'Monthly salary',
    categoryId: 'inc-salary',
    description: '',
    currency: 'USD',
    expectedAmountMinor: 450000,
    frequency: 'monthly',
    nextExpectedDate: todayIso(),
    anchorDay: 1,
    endDate: null,
    accountId: null,
    status: 'active',
    notes: '',
    ...stamp,
    ...overrides,
  }
}

describe('Dashboard', () => {
  it('shows a welcome state without transactions', async () => {
    renderApp('/')
    expect(await screen.findByText('Welcome to SpendWise')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add income/i })).toBeInTheDocument()
  })

  it('renders in Arabic', async () => {
    renderApp('/', emptyData({ settings: { ...emptyData().settings, language: 'ar' } }))
    expect(await screen.findByText('مرحباً بك في SpendWise')).toBeInTheDocument()
  })

  it('derives totals from data and updates after a new expense', async () => {
    const today = todayIso()
    const { user } = renderApp(
      '/',
      emptyData({
        transactions: [
          tx({ id: 'i', type: 'income', amountMinor: 300000, date: today, categoryId: 'inc-salary' }),
          tx({ id: 'e', amountMinor: 12345, date: today }),
          tx({ id: 'eur', amountMinor: 999, date: today, currency: 'EUR' }),
        ],
        settings: { ...emptyData().settings, openingBalances: [{ currency: 'USD', amountMinor: 100000 }] },
      }),
    )
    await screen.findByText(/Income · USD/)
    expect(statValue(/Income · USD/)).toBe('$3,000.00')
    expect(statValue(/Expenses · USD/)).toBe('$123.45')
    expect(statValue(/Net cash flow · USD/)).toBe('+$2,876.55')
    expect(statValue(/Recorded balance · USD/)).toBe('$3,876.55')
    // The EUR expense is reported separately, never added to USD totals.
    expect(screen.getByText(/also has activity in other currencies/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Description'), 'Dinner')
    await user.type(within(dialog).getByLabelText('Amount'), '76.55')
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    await waitFor(() => expect(statValue(/Expenses · USD/)).toBe('$200.00'))
    expect(statValue(/Net cash flow · USD/)).toBe('+$2,800.00')
  })

  it('nets refunds, ignores transfers, and shows card debt and expected income', async () => {
    const today = todayIso()
    renderApp(
      '/',
      emptyData({
        accounts: [card()],
        incomeSources: [salary({ frequency: 'once' })],
        transactions: [
          tx({ id: 'e', amountMinor: 20000, date: today, accountId: 'visa' }),
          tx({ id: 'r', type: 'refund', amountMinor: 5000, date: today, accountId: 'visa' }),
          tx({ id: 't', type: 'transfer', amountMinor: 10000, date: today, categoryId: 'transfer', toAccountId: 'visa' }),
        ],
      }),
    )
    await screen.findByText(/Expenses · USD/)
    expect(statValue(/Expenses · USD/)).toBe('$150.00')
    // Card opening −500 − 200 + 50 = −650 recorded; the transfer from an unrecorded account adds +100.
    expect(statValue(/Recorded balance · USD/)).toBe('-$650.00')
    expect(within(screen.getByTestId('card-debt')).getByText('$550.00')).toBeInTheDocument()

    const expected = screen.getByText('Expected income').closest('[data-slot="card"]') as HTMLElement
    // A one-off payment due today: listed once, and its amount is the 30-day total.
    expect(within(expected).getAllByRole('link', { name: 'Monthly salary' })).toHaveLength(1)
    expect(within(expected).getAllByText('$4,500.00')).toHaveLength(2)
  })
})
