import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { todayIso } from '@/lib/dates'
import { tx } from '@/test/factories'
import { emptyData, renderApp } from '@/test/renderApp'

function statValue(title: RegExp) {
  const label = screen.getByText(title)
  const card = label.closest('[data-slot="card"]') as HTMLElement
  return within(card).getByText(/\$/).textContent
}

describe('Dashboard', () => {
  it('shows a welcome state without transactions', async () => {
    renderApp('/')
    expect(await screen.findByText('Welcome to SpendWise')).toBeInTheDocument()
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
    expect(statValue(/Current balance · USD/)).toBe('$3,876.55')
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
})
