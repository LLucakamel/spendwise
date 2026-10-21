import { zodResolver } from '@hookform/resolvers/zod'
import { CreditCardIcon, HandCoinsIcon, HistoryIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormField } from '@/components/common/FormField'
import { Money } from '@/components/common/Money'
import { CurrencySelect } from '@/components/common/pickers'
import { EmptyState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { debtFormSchema, type DebtFormValues } from '@/domain/schemas'
import { DEBT_KINDS, type Debt, type DebtInput } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { todayIso } from '@/lib/dates'
import { accountBalances } from '@/lib/finance'
import { minorToDecimalString, parseAmountToMinor } from '@/lib/money'
import { debtOutstanding, payoffEstimate } from '@/lib/tools'
import { AmountEntryDialog, HistoryDialog, type DatedAmount } from './toolsUi'

/** Parses an annual rate typed as "18.5" or "18,5"; null when empty or invalid. */
function parseRate(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null
  return Number(trimmed)
}

function PayoffText({ balanceMinor, rate, paymentMinor, currency }: { balanceMinor: number; rate: number | null; paymentMinor: number | null; currency: string }) {
  const { t } = useI18n()
  const format = useFormat()
  if (balanceMinor <= 0) return <p className="text-sm text-income">{t('tools.debts.paid')}</p>
  if (rate === null || paymentMinor === null || paymentMinor <= 0) return <p className="text-sm text-muted-foreground">{t('tools.debts.payoffUnknown')}</p>
  const estimate = payoffEstimate(balanceMinor, rate, paymentMinor)
  if (estimate.neverPaysOff) return <p className="text-sm font-medium text-expense">{t('tools.debts.payoffNever')}</p>
  if (estimate.months === null || estimate.totalInterestMinor === null) return <p className="text-sm text-muted-foreground">{t('tools.debts.payoffUnknown')}</p>
  return (
    <p className="text-sm">
      {t('tools.debts.payoff', { months: format.number(estimate.months), interest: format.money(estimate.totalInterestMinor, currency) })}
    </p>
  )
}

function DebtForm({ debt, onDone }: { debt?: Debt; onDone(): void }) {
  const repo = useRepository()
  const { settings } = useFinance()
  const { t } = useI18n()
  const [id] = useState(() => debt?.id ?? repo.newId())
  const dec = (minor: number | null, currency: string) => (minor === null ? '' : minorToDecimalString(minor, currency))
  const { register, handleSubmit, formState } = useForm<DebtFormValues>({
    resolver: zodResolver(debtFormSchema),
    defaultValues: debt
      ? {
          name: debt.name,
          kind: debt.kind,
          lender: debt.lender,
          currency: debt.currency,
          original: dec(debt.originalMinor, debt.currency),
          annualRate: debt.annualRate,
          minimumPayment: dec(debt.minimumPaymentMinor, debt.currency),
          dueDay: debt.dueDay ? String(debt.dueDay) : '',
          notes: debt.notes,
        }
      : { name: '', kind: 'loan', lender: '', currency: settings.displayCurrency, original: '', annualRate: '', minimumPayment: '', dueDay: '', notes: '' },
  })
  const errors = formState.errors
  const save = useMutation((input: DebtInput) => (debt ? repo.update('debts', id, input) : repo.create('debts', id, input)), {
    success: debt ? 'toast.saved' : 'tools.debts.created',
    errorPrefix: 'toast.couldNotSave',
  })

  const onSubmit = handleSubmit(async (v) => {
    const original = parseAmountToMinor(v.original, v.currency)
    if (!original.ok) return
    const minimum = v.minimumPayment.trim() ? parseAmountToMinor(v.minimumPayment, v.currency) : null
    const input: DebtInput = {
      name: v.name.trim(),
      kind: v.kind,
      lender: v.lender.trim(),
      currency: v.currency,
      originalMinor: original.value,
      annualRate: v.annualRate.trim().replace(',', '.'),
      minimumPaymentMinor: minimum && minimum.ok ? minimum.value : null,
      dueDay: v.dueDay ? Number(v.dueDay) : null,
      payments: debt?.payments ?? [],
      notes: v.notes.trim(),
    }
    const outcome = await save.run(input)
    if (outcome.status !== 'error') onDone()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('common.name')} error={errors.name?.message}>
          <Input autoComplete="off" {...register('name')} />
        </FormField>
        <FormField label={t('tools.debts.kind')}>
          <NativeSelect {...register('kind')}>
            {DEBT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`tools.debts.kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('tools.debts.lender')} error={errors.lender?.message}>
          <Input autoComplete="off" {...register('lender')} />
        </FormField>
        <FormField label={t('common.currency')} error={errors.currency?.message}>
          {debt?.payments.length ? <Input value={debt.currency} readOnly dir="ltr" /> : <CurrencySelect {...register('currency')} />}
        </FormField>
        <FormField label={t('tools.debts.original')} error={errors.original?.message}>
          <Input inputMode="decimal" dir="ltr" placeholder="0.00" className="tabular" {...register('original')} />
        </FormField>
        <FormField label={t('tools.debts.rate')} error={errors.annualRate?.message}>
          <Input inputMode="decimal" dir="ltr" className="tabular" {...register('annualRate')} />
        </FormField>
        <FormField label={t('tools.debts.minimum')} error={errors.minimumPayment?.message}>
          <Input inputMode="decimal" dir="ltr" className="tabular" {...register('minimumPayment')} />
        </FormField>
        <FormField label={t('tools.debts.dueDay')} error={errors.dueDay?.message}>
          <Input inputMode="numeric" dir="ltr" {...register('dueDay')} />
        </FormField>
      </div>
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {debt ? t('common.saveChanges') : t('tools.debts.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function DebtFormDialog({ open, onOpenChange, debt }: { open: boolean; onOpenChange(open: boolean): void; debt?: Debt }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{debt ? t('tools.debts.formEdit') : t('tools.debts.formNew')}</DialogTitle>
          <DialogDescription>{t('tools.debts.emptyText')}</DialogDescription>
        </DialogHeader>
        {open ? <DebtForm debt={debt} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function DebtCard({ debt, onEdit, onPay, onHistory, onDelete }: { debt: Debt; onEdit(): void; onPay(): void; onHistory(): void; onDelete(): void }) {
  const { t } = useI18n()
  const outstanding = debtOutstanding(debt)
  const paidRatio = debt.originalMinor > 0 ? 1 - outstanding / debt.originalMinor : 0
  const subtitle = [t(`tools.debts.kinds.${debt.kind}`), debt.lender].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {debt.name}
          {outstanding === 0 ? <Badge className="bg-income text-white">{t('tools.debts.paid')}</Badge> : null}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common.actionsFor', { name: debt.name })}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onPay} disabled={outstanding === 0}>
                <HandCoinsIcon /> {t('tools.debts.recordPayment')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onHistory}>
                <HistoryIcon /> {t('tools.debts.history')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon /> {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon /> {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t('tools.debts.outstanding')}</dt>
            <dd className="text-lg font-semibold">
              <Money minor={outstanding} currency={debt.currency} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t('tools.debts.original')}</dt>
            <dd className="text-lg">
              <Money minor={debt.originalMinor} currency={debt.currency} />
            </dd>
          </div>
        </dl>
        <Progress value={paidRatio * 100} aria-label={debt.name} indicatorClassName="bg-income" />
        <PayoffText balanceMinor={outstanding} rate={parseRate(debt.annualRate)} paymentMinor={debt.minimumPaymentMinor} currency={debt.currency} />
        {outstanding > 0 ? (
          <div>
            <Button size="sm" variant="outline" onClick={onPay}>
              <HandCoinsIcon /> {t('tools.debts.recordPayment')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** Payoff estimate for a credit-card balance with a rate and monthly payment chosen by the user. */
function CardPayoffPlanner() {
  const { accounts, transactions } = useFinance()
  const { t } = useI18n()
  const today = todayIso()
  const cards = useMemo(() => accounts.filter((a) => a.kind === 'credit-card' && !a.archived), [accounts])
  const owed = useMemo(() => new Map(accountBalances(cards, transactions, today).map((b) => [b.accountId, b.owedMinor ?? 0])), [cards, transactions, today])
  const [cardId, setCardId] = useState('')
  const [rate, setRate] = useState('')
  const [payment, setPayment] = useState<string | null>(null)
  const card = cards.find((c) => c.id === cardId) ?? cards[0]

  if (!card) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('tools.debts.cardPlan')}</CardTitle>
          <CardDescription>{t('tools.debts.cardPlanText')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState icon={CreditCardIcon} title={t('tools.debts.noCards')} className="py-4" />
        </CardContent>
      </Card>
    )
  }

  const owedMinor = owed.get(card.id) ?? 0
  const paymentText = payment ?? (card.minimumPaymentMinor !== null ? minorToDecimalString(card.minimumPaymentMinor, card.currency) : '')
  const parsedPayment = paymentText.trim() ? parseAmountToMinor(paymentText, card.currency) : null
  const parsedRate = parseRate(rate)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tools.debts.cardPlan')}</CardTitle>
        <CardDescription>{t('tools.debts.cardPlanText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label={t('tools.debts.cards')}>
            <NativeSelect
              value={card.id}
              onChange={(e) => {
                setCardId(e.target.value)
                setPayment(null)
              }}
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.currency}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('tools.debts.cardRate')} error={rate.trim() && parsedRate === null ? 'validation.rate' : undefined}>
            <Input inputMode="decimal" dir="ltr" className="tabular" value={rate} onChange={(e) => setRate(e.target.value)} />
          </FormField>
          <FormField label={`${t('tools.debts.monthlyPayment')} (${card.currency})`} error={parsedPayment && !parsedPayment.ok ? parsedPayment.error : undefined}>
            <Input inputMode="decimal" dir="ltr" className="tabular" value={paymentText} onChange={(e) => setPayment(e.target.value)} />
          </FormField>
        </div>
        <p className="text-sm">
          {t('accounts.owed')}: <Money minor={owedMinor} currency={card.currency} className="font-semibold" />
        </p>
        <PayoffText balanceMinor={owedMinor} rate={parsedRate} paymentMinor={parsedPayment?.ok ? parsedPayment.value : null} currency={card.currency} />
      </CardContent>
    </Card>
  )
}

export function DebtsTab() {
  const { debts } = useFinance()
  const repo = useRepository()
  const { t } = useI18n()
  const [form, setForm] = useState<{ open: boolean; debt?: Debt }>({ open: false })
  const [paying, setPaying] = useState<Debt | null>(null)
  const [history, setHistory] = useState<Debt | null>(null)
  const [toDelete, setToDelete] = useState<Debt | null>(null)

  const pay = useMutation((debt: Debt, entry: DatedAmount) => repo.update('debts', debt.id, { payments: [...debt.payments, entry] }), {
    success: 'tools.debts.paymentAdded',
    errorPrefix: 'toast.couldNotSave',
  })
  const remove = useMutation((id: string) => repo.remove('debts', id), { success: 'toast.deleted', errorPrefix: 'toast.couldNotDelete' })
  const sorted = [...debts].sort((a, b) => Number(debtOutstanding(a) === 0) - Number(debtOutstanding(b) === 0) || a.name.localeCompare(b.name))
  const historyDebt = history ? (debts.find((d) => d.id === history.id) ?? history) : null

  return (
    <section className="grid gap-4" aria-label={t('tools.tabs.debts')}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-muted-foreground">{t('tools.debts.estimateNote')}</p>
        <Button onClick={() => setForm({ open: true })}>
          <PlusIcon /> {t('tools.debts.add')}
        </Button>
      </div>
      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={HandCoinsIcon}
            title={t('tools.debts.empty')}
            description={t('tools.debts.emptyText')}
            action={
              <Button onClick={() => setForm({ open: true })}>
                <PlusIcon /> {t('tools.debts.add')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              onEdit={() => setForm({ open: true, debt })}
              onPay={() => setPaying(debt)}
              onHistory={() => setHistory(debt)}
              onDelete={() => setToDelete(debt)}
            />
          ))}
        </div>
      )}

      <CardPayoffPlanner />

      <DebtFormDialog open={form.open} debt={form.debt} onOpenChange={(open) => setForm((f) => ({ ...f, open }))} />
      <AmountEntryDialog
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        title={t('tools.debts.recordPayment')}
        description={paying?.name ?? ''}
        currency={paying?.currency ?? ''}
        pending={pay.pending}
        onSubmit={async (entry) => {
          if (!paying) return false
          const current = debts.find((d) => d.id === paying.id) ?? paying
          return (await pay.run(current, entry)).status !== 'error'
        }}
      />
      <HistoryDialog
        open={historyDebt !== null}
        onOpenChange={(open) => !open && setHistory(null)}
        title={t('tools.debts.history')}
        description={historyDebt?.name ?? ''}
        entries={historyDebt?.payments ?? []}
        currency={historyDebt?.currency ?? ''}
        emptyText={t('tools.debts.noPayments')}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('tools.debts.deleteTitle')}
        description={t('tools.debts.deleteText', { name: toDelete?.name ?? '' })}
        onConfirm={async () => (toDelete ? (await remove.run(toDelete.id)).status !== 'error' : false)}
      />
    </section>
  )
}
