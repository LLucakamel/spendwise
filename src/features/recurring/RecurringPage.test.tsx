import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoRepository } from '@/data/demo/demoRepository'
import { DuplicatePaymentError } from '@/lib/recurring'
import { bill } from '@/test/factories'
import { emptyData, renderApp, snapshot } from '@/test/renderApp'

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
    expect(data.transactions[0]).toMatchObject({ id: 'bill_bill1_2026-01-31', amountMinor: 5999, recurringBillId: 'bill1', recurringDueDate: '2026-01-31' })
    expect(data.recurringBills[0]?.nextDueDate).toBe('2026-02-28')
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
})
