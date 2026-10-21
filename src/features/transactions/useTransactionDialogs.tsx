import { useState } from 'react'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Money } from '@/components/common/Money'
import type { Transaction, TransactionType } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { TransactionDetailsSheet } from './TransactionDetailsSheet'
import { TransactionFormDialog } from './TransactionFormDialog'

/** Create / edit / details / delete dialogs for transactions, shared by several pages. */
export function useTransactionDialogs() {
  const repo = useRepository()
  const format = useFormat()
  const [form, setForm] = useState<{ open: boolean; transaction?: Transaction; type: TransactionType }>({
    open: false,
    type: 'expense',
  })
  const [details, setDetails] = useState<Transaction | null>(null)
  const [toDelete, setToDelete] = useState<Transaction | null>(null)
  const remove = useMutation((id: string) => repo.deleteTransaction(id), {
    success: 'Transaction deleted',
    errorPrefix: 'Couldn’t delete the transaction.',
  })

  const dialogs = (
    <>
      <TransactionFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
        transaction={form.transaction}
        defaultType={form.type}
      />
      <TransactionDetailsSheet
        transaction={details}
        onOpenChange={(open) => !open && setDetails(null)}
        onEdit={(t) => {
          setDetails(null)
          setForm({ open: true, transaction: t, type: t.type })
        }}
        onDelete={(t) => {
          setDetails(null)
          setToDelete(t)
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this transaction?"
        description={
          toDelete ? (
            <p>
              “{toDelete.description}” (<Money minor={toDelete.amountMinor} currency={toDelete.currency} type={toDelete.type} />{' '}
              on {format.date(toDelete.date)}) will be permanently removed. Totals and budgets will update.
              {toDelete.recurringBillId ? ' The linked bill keeps its current due date.' : ''}
            </p>
          ) : null
        }
        onConfirm={async () => {
          if (!toDelete) return true
          const outcome = await remove.run(toDelete.id)
          return outcome.status !== 'error'
        }}
      />
    </>
  )

  return {
    dialogs,
    openCreate: (type: TransactionType = 'expense') => setForm({ open: true, transaction: undefined, type }),
    openEdit: (t: Transaction) => setForm({ open: true, transaction: t, type: t.type }),
    openDetails: (t: Transaction) => setDetails(t),
    requestDelete: (t: Transaction) => setToDelete(t),
  }
}
