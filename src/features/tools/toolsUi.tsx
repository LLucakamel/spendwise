import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/common/FormField'
import { Money } from '@/components/common/Money'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { IsoDate } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { isValidIsoDate, todayIso } from '@/lib/dates'
import { parseAmountToMinor } from '@/lib/money'

export interface DatedAmount {
  date: IsoDate
  amountMinor: number
  note: string
}

/** Records one dated amount (a goal contribution or a debt payment). */
export function AmountEntryDialog({
  open,
  onOpenChange,
  title,
  description,
  currency,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: string
  currency: string
  pending: boolean
  onSubmit(entry: DatedAmount): Promise<boolean>
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? <AmountEntryForm currency={currency} pending={pending} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AmountEntryForm({ currency, pending, onCancel, onSubmit }: { currency: string; pending: boolean; onCancel(): void; onSubmit(entry: DatedAmount): Promise<boolean> }) {
  const { t } = useI18n()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const parsed = parseAmountToMinor(amount, currency)
  const dateOk = isValidIsoDate(date)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!parsed.ok || !dateOk) return
    if (await onSubmit({ date, amountMinor: parsed.value, note: note.trim().slice(0, 200) })) onCancel()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <FormField label={`${t('common.amount')} (${currency})`} error={submitted && !parsed.ok ? parsed.error : undefined}>
        <Input inputMode="decimal" dir="ltr" placeholder="0.00" className="tabular" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <FormField label={t('common.date')} error={submitted && !dateOk ? 'validation.date' : undefined}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <FormField label={t('common.notesOptional')}>
        <Input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Read-only list of dated amounts, newest first. */
export function HistoryList({ entries, currency, emptyText }: { entries: readonly DatedAmount[]; currency: string; emptyText: string }) {
  const format = useFormat()
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <ul className="divide-y rounded-lg border">
      {sorted.map((entry, index) => (
        <li key={`${entry.date}-${index}`} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block">{format.date(entry.date)}</span>
            {entry.note ? <span className="block truncate text-xs text-muted-foreground">{entry.note}</span> : null}
          </span>
          <Money minor={entry.amountMinor} currency={currency} className="shrink-0 font-medium" />
        </li>
      ))}
    </ul>
  )
}

export function HistoryDialog({
  open,
  onOpenChange,
  title,
  description,
  entries,
  currency,
  emptyText,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: string
  entries: readonly DatedAmount[]
  currency: string
  emptyText: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <HistoryList entries={entries} currency={currency} emptyText={emptyText} />
      </DialogContent>
    </Dialog>
  )
}
