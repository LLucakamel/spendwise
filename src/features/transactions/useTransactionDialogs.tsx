import { useState } from 'react'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import type { Transaction } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { TransactionDetailsSheet } from './TransactionDetailsSheet'
import { TransactionFormDialog, type TransactionDraft } from './TransactionFormDialog'

/** Create / edit / details / delete dialogs for transactions, shared by several pages. */
export function useTransactionDialogs() {
  const repo = useRepository()
  const format = useFormat()
  const { t } = useI18n()
  const [form, setForm] = useState<{ open: boolean; transaction?: Transaction; draft?: TransactionDraft }>({ open: false })
  const [details, setDetails] = useState<Transaction | null>(null)
  const [toDelete, setToDelete] = useState<Transaction | null>(null)
  const remove = useMutation((id: string) => repo.deleteTransaction(id), { success: 'transactions.deleted', errorPrefix: 'toast.couldNotDelete' })

  const dialogs = (
    <>
      <TransactionFormDialog open={form.open} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} transaction={form.transaction} draft={form.draft} />
      <TransactionDetailsSheet
        transaction={details}
        onOpenChange={(open) => !open && setDetails(null)}
        onEdit={(tx) => {
          setDetails(null)
          setForm({ open: true, transaction: tx })
        }}
        onDelete={(tx) => {
          setDetails(null)
          setToDelete(tx)
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('transactions.deleteTitle')}
        description={
          toDelete ? (
            <p>
              {t('transactions.deleteText', { name: toDelete.description, amount: format.money(toDelete.amountMinor, toDelete.currency), date: format.date(toDelete.date) })}
              {toDelete.recurringBillId || toDelete.invoiceId || toDelete.incomeSourceId ? ` ${t('transactions.deleteLinked')}` : ''}
            </p>
          ) : null
        }
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : true)}
      />
    </>
  )

  return {
    dialogs,
    openCreate: (draft?: TransactionDraft) => setForm({ open: true, transaction: undefined, draft }),
    openEdit: (tx: Transaction) => setForm({ open: true, transaction: tx }),
    openDetails: (tx: Transaction) => setDetails(tx),
    requestDelete: (tx: Transaction) => setToDelete(tx),
  }
}
