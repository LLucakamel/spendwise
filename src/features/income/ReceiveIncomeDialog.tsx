import { CheckIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { AccountSelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFinance } from '@/data/DataProvider'
import type { IncomeSource } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { isValidIsoDate, todayIso } from '@/lib/dates'
import { incomeReceiptId, nextIncomeDate, occurrenceStatus } from '@/lib/income'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'

/**
 * Records money actually received for the source's current expected payment. Partial receipts keep
 * the payment open; each receipt gets a deterministic ID so a double click can't record it twice.
 */
export function ReceiveIncomeDialog({ source, onOpenChange }: { source: IncomeSource | null; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={source !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {source ? <ReceiveForm key={`${source.id}-${source.nextExpectedDate}`} source={source} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ReceiveForm({ source, onDone }: { source: IncomeSource; onDone(): void }) {
  const repo = useRepository()
  const { transactions } = useFinance()
  const format = useFormat()
  const { t, tx } = useI18n()
  const today = todayIso()
  const occurrence = occurrenceStatus(source, source.nextExpectedDate, transactions, today)
  const [amount, setAmount] = useState(minorToDecimalString(occurrence.remainingMinor || source.expectedAmountMinor, source.currency))
  const [date, setDate] = useState(today)
  const [accountId, setAccountId] = useState(source.accountId ?? '')
  const [reference, setReference] = useState('')
  const [closeAnyway, setCloseAnyway] = useState(false)
  // Fixed for this dialog: the n-th receipt of this expected payment.
  const [receiptId] = useState(() => incomeReceiptId(source.id, source.nextExpectedDate, occurrence.receiptCount + 1))
  const parsed = parseAmountToMinor(amount, source.currency)
  const value = parsed.ok ? parsed.value : 0
  const after = occurrence.receivedMinor + value
  const remainingAfter = Math.max(0, source.expectedAmountMinor - after)
  const completes = remainingAfter === 0 || closeAnyway
  const next = nextIncomeDate(source, source.nextExpectedDate)
  const record = useMutation(
    () => repo.recordIncomeReceipt(source, { amountMinor: value, date, accountId: accountId || null, notes: '', sourceRef: reference.trim() || null }, receiptId, completes),
    { success: 'income.receive.done', errorPrefix: 'toast.couldNotSave', queuesOffline: false },
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('income.receive.title', { name: source.name })}</DialogTitle>
        <DialogDescription>{t('income.receive.text', { date: format.date(source.nextExpectedDate) })}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 text-sm">
        <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3">
          <dt className="text-muted-foreground">{t('income.receive.expected')}</dt>
          <dd className="text-end tabular">{format.money(source.expectedAmountMinor, source.currency)}</dd>
          <dt className="text-muted-foreground">{t('income.receive.alreadyReceived')}</dt>
          <dd className="text-end tabular">{format.money(occurrence.receivedMinor, source.currency)}</dd>
        </dl>
        <FormField label={`${t('income.receive.amountReceived')} (${source.currency})`} error={parsed.ok ? undefined : parsed.error}>
          <Input inputMode="decimal" dir="ltr" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('income.receive.dateReceived')} error={isValidIsoDate(date) ? undefined : 'validation.date'}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label={t('income.receive.account')}>
            <AccountSelect currency={source.currency} value={accountId} onChange={(e) => setAccountId(e.target.value)} />
          </FormField>
        </div>
        <FormField label={t('income.receive.reference')}>
          <Input dir="auto" value={reference} onChange={(e) => setReference(e.target.value)} />
        </FormField>
        {parsed.ok && remainingAfter > 0 ? (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={closeAnyway} onChange={(e) => setCloseAnyway(e.target.checked)} />
            <span>
              {t('income.receive.closeAnyway')}
              <span className="block text-xs text-muted-foreground">{t('income.receive.closeAnywayHint')}</span>
            </span>
          </label>
        ) : null}
        {parsed.ok ? (
          <div className="rounded-lg border p-3">
            <p className="mb-2 font-medium">{t('income.receive.willDo')}</p>
            <ul className="grid list-disc gap-1 ps-5 text-muted-foreground">
              <li>{t('income.receive.addTx', { amount: format.money(value, source.currency), date: isValidIsoDate(date) ? format.date(date) : '—' })}</li>
              {!completes ? <li>{t('income.receive.partial', { amount: format.money(remainingAfter, source.currency) })}</li> : null}
              {completes ? <li>{next && (source.endDate === null || next <= source.endDate) ? t('income.receive.complete', { next: format.date(next) }) : t('income.receive.completeOnce')}</li> : null}
              {after > source.expectedAmountMinor ? <li>{t('income.receive.over', { amount: format.money(after - source.expectedAmountMinor, source.currency) })}</li> : null}
            </ul>
          </div>
        ) : (
          <p className="sr-only">{tx(parsed.error)}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={record.pending}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={record.pending || !parsed.ok || !isValidIsoDate(date)}
          onClick={async () => {
            const outcome = await record.run()
            if (outcome.status !== 'error') onDone()
          }}
        >
          {record.pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {t('income.receive.submit')}
        </Button>
      </DialogFooter>
    </>
  )
}
