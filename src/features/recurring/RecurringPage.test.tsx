import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoRepository } from '@/data/demo/demoRepository'
import type { Account } from '@/domain/types'
import { DuplicatePaymentError } from '@/lib/recurring'
import { bill } from '@/test/factories'
import { emptyData, renderApp, snapshot } from '@/test/renderApp'

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc1',
    name: 'Main bank',
    kind: 'bank',
    provider: '',
    currency: 'USD',
    openingBalanceMinor: 0,
    last4: '',
    syncMode: 'manual',
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    minimumPaymentMinor: null,
    archived: false,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('Recurring bills', () => {
  it('records one expense when a bill is marked as paid and advances the due date', async () => {
    const { user, repository } = renderApp('/bills', emptyData({ recurringBills: [bill({ nextDueDate: '2026-01-31', anchorDay: 31 })] }))
    await user.click(await screen.findByRole('button', { name: /mark paid/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Add an expense of/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const data = await snapshot(repository)
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0]).toMatchObject({ id: 'bill_bill1_2026-01-31', amountMinor: 5999, recurringBillId: 'bill1', recurringDueDate: '2026-01-31', accountId: null })
    expect(data.recurringBills[0]?.nextDueDate).toBe('2026-02-28')
  })

  it('pays from the bill’s usual account by default and allows choosing another', async () => {
    const accounts = [account(), account({ id: 'acc2', name: 'Wallet', kind: 'cash' }), account({ id: 'acc3', name: 'Euro card', currency: 'EUR' })]
    const { user, repository } = renderApp('/bills', emptyData({ accounts, recurringBills: [bill({ accountId: 'acc1' })] }))
    await user.click(await screen.findByRole('button', { name: /mark paid/i }))
    const dialog = await screen.findByRole('dialog')
    const paidFrom = within(dialog).getByLabelText('Paid from account')
    expect(paidFrom).toHaveValue('acc1')
    // Only accounts in the bill's currency are offered.
    expect(within(paidFrom).queryByRole('option', { name: /Euro card/ })).not.toBeInTheDocument()
    await user.selectOptions(paidFrom, 'acc2')
    await user.click(within(dialog).getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(async () => expect((await snapshot(repository)).transactions[0]?.accountId).toBe('acc2'))
  })

  it('saves the usual account on a new bill', async () => {
    const { user, repository } = renderApp('/bills', emptyData({ accounts: [account()] }))
    await user.click(await screen.findByRole('button', { name: /add a bill/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Rent')
    await user.type(within(dialog).getByLabelText('Amount'), '900')
    await user.selectOptions(within(dialog).getByLabelText('Usually paid from (optional)'), 'acc1')
    await user.click(within(dialog).getByRole('button', { name: 'Add bill' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await snapshot(repository)).recurringBills[0]).toMatchObject({ name: 'Rent', amountMinor: 90000, accountId: 'acc1', status: 'active' })
  })

  it('rejects recording the same occurrence twice at the repository level', async () => {
    const original = bill({ nextDueDate: '2026-01-31' })
    const repository = new DemoRepository(emptyData({ recurringBills: [original] }))
    await repository.recordBillPayment(original, '2026-01-31')
    await expect(repository.recordBillPayment(original, '2026-01-31')).rejects.toBeInstanceOf(DuplicatePaymentError)
    expect((await snapshot(repository)).transactions).toHaveLength(1)
  })

  it('pauses and resumes a bill', async () => {
    const { user, repository } = renderApp('/bills', emptyData({ recurringBills: [bill({ name: 'Gym' })] }))
    await user.click(await screen.findByRole('button', { name: 'Actions for Gym' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Pause' }))
    await waitFor(async () => expect((await snapshot(repository)).recurringBills[0]?.status).toBe('paused'))
    await user.click(await screen.findByRole('button', { name: 'Actions for Gym' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Resume' }))
    await waitFor(async () => expect((await snapshot(repository)).recurringBills[0]?.status).toBe('active'))
  })

  it('renders in Arabic', async () => {
    const data = emptyData({ recurringBills: [bill({ name: 'Gym' })] })
    renderApp('/bills', { ...data, settings: { ...data.settings, language: 'ar' } }, { language: 'ar' })
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Recurring bills')
    expect(screen.queryByText('Mark paid')).not.toBeInTheDocument()
  })
})
