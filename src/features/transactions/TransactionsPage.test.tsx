import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyData, renderApp, snapshot } from '@/test/renderApp'
import { tx } from '@/test/factories'

describe('Transactions page', () => {
  it('shows an empty state when there are no transactions', async () => {
    renderApp('/transactions')
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
  })

  it('validates input before saving', async () => {
    const { user, repository } = renderApp('/transactions')
    await user.click((await screen.findAllByRole('button', { name: /add transaction/i }))[0]!)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    expect(await within(dialog).findByText('Enter a description.')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter an amount.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Description'), 'Coffee')
    await user.type(within(dialog).getByLabelText('Amount'), '3.456')
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    expect(await within(dialog).findByText('USD allows at most 2 decimal places.')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Amount'))
    await user.type(within(dialog).getByLabelText('Amount'), '-4')
    await user.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
    expect(await within(dialog).findByText(/Enter a number/)).toBeInTheDocument()
    expect((await snapshot(repository)).transactions).toHaveLength(0)
  })

  it('creates exactly one transaction even when submit is clicked repeatedly', async () => {
    const { user, repository } = renderApp('/transactions')
    await user.click((await screen.findAllByRole('button', { name: /add transaction/i }))[0]!)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Description'), 'Weekly groceries')
    await user.type(within(dialog).getByLabelText('Amount'), '42.10')
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'exp-groceries')
    const submit = within(dialog).getByRole('button', { name: 'Add transaction' })
    await user.click(submit)
    await user.click(submit).catch(() => undefined)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const data = await snapshot(repository)
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0]).toMatchObject({ description: 'Weekly groceries', amountMinor: 4210, currency: 'USD', type: 'expense' })
    expect(await screen.findAllByText('Weekly groceries')).not.toHaveLength(0)
  })

  it('edits and deletes a transaction with confirmation', async () => {
    const { user, repository } = renderApp('/transactions', emptyData({ transactions: [tx({ id: 'x1', description: 'Old name', amountMinor: 1500 })] }))
    const [actions] = await screen.findAllByRole('button', { name: 'Actions for Old name' })
    await user.click(actions!)
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    const description = within(dialog).getByLabelText('Description')
    await user.clear(description)
    await user.type(description, 'New name')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(async () => expect((await snapshot(repository)).transactions[0]?.description).toBe('New name'))

    const [actions2] = await screen.findAllByRole('button', { name: 'Actions for New name' })
    await user.click(actions2!)
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText(/will be permanently removed/)).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await snapshot(repository)).transactions).toHaveLength(0))
  })

  it('searches and filters, and explains when nothing matches', async () => {
    const { user } = renderApp(
      '/transactions',
      emptyData({
        transactions: [
          tx({ id: '1', description: 'Greenleaf Market', categoryId: 'exp-groceries' }),
          tx({ id: '2', description: 'Payroll', type: 'income', categoryId: 'inc-salary', amountMinor: 500000 }),
        ],
      }),
    )
    await user.type(await screen.findByLabelText('Search transactions'), 'greenleaf')
    expect(screen.getByTestId('tx-count')).toHaveTextContent('1 of 2')
    await user.clear(screen.getByLabelText('Search transactions'))
    await user.selectOptions(screen.getByLabelText('Type'), 'income')
    expect(screen.getByTestId('tx-count')).toHaveTextContent('1 of 2')
    await user.type(screen.getByLabelText('Search transactions'), 'nothing-like-this')
    expect(await screen.findByText('No matching transactions')).toBeInTheDocument()
  })
})
