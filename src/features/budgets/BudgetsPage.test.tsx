import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { monthOf, todayIso } from '@/lib/dates'
import { budget, tx } from '@/test/factories'
import { emptyData, renderApp, snapshot } from '@/test/renderApp'

describe('Budgets', () => {
  const today = todayIso()
  const month = monthOf(today)

  it('shows usage calculated from matching expenses only', async () => {
    renderApp(
      '/budgets',
      emptyData({
        budgets: [budget({ id: 'g', name: 'Food', limitMinor: 20000, startMonth: month })],
        transactions: [
          tx({ amountMinor: 17000, date: today }),
          tx({ amountMinor: 5000, date: today, type: 'income', categoryId: 'exp-groceries' }),
          tx({ amountMinor: 9900, date: today, currency: 'EUR' }),
        ],
      }),
    )
    expect(await screen.findByText('$170.00')).toBeInTheDocument()
    expect(screen.getByText(/85% used/)).toBeInTheDocument()
    expect(screen.getByText('Near limit')).toBeInTheDocument()
    expect(screen.getByText(/used another currency and is not counted/)).toBeInTheDocument()
  })

  it('creates a budget and blocks an overlapping duplicate', async () => {
    const { user, repository } = renderApp('/budgets')
    await user.click(await screen.findByRole('button', { name: /create your first budget/i }))
    let dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Groceries')
    await user.selectOptions(within(dialog).getByLabelText('Expense category'), 'exp-groceries')
    await user.type(within(dialog).getByLabelText('Monthly limit'), '400')
    await user.click(within(dialog).getByRole('button', { name: 'Create budget' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await snapshot(repository)).budgets).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /new budget/i }))
    dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Groceries again')
    await user.selectOptions(within(dialog).getByLabelText('Expense category'), 'exp-groceries')
    await user.type(within(dialog).getByLabelText('Monthly limit'), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Create budget' }))
    expect(await within(dialog).findByText(/already budgets this category/)).toBeInTheDocument()
    expect((await snapshot(repository)).budgets).toHaveLength(1)
  })
})
