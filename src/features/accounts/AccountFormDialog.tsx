import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useFinance } from '@/data/DataProvider'
import { accountFormSchema, type AccountFormValues } from '@/domain/schemas'
import { ACCOUNT_KINDS, SYNC_MODES, type Account, type AccountInput } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { minorToDecimalString, parseAmountToMinor, parseSignedAmountToMinor } from '@/lib/money'

function AccountForm({ account, onDone }: { account?: Account; onDone(): void }) {
  const repo = useRepository()
  const { settings } = useFinance()
  const { t } = useI18n()
  const [id] = useState(() => account?.id ?? repo.newId())
  const dec = (minor: number | null, currency: string) => (minor === null ? '' : minorToDecimalString(minor, currency))
  const { register, handleSubmit, formState, control } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: account
      ? {
          name: account.name,
          kind: account.kind,
          provider: account.provider,
          currency: account.currency,
          openingBalance: dec(account.openingBalanceMinor, account.currency),
          last4: account.last4,
          syncMode: account.syncMode,
          creditLimit: dec(account.creditLimitMinor, account.currency),
          statementDay: account.statementDay ? String(account.statementDay) : '',
          paymentDueDay: account.paymentDueDay ? String(account.paymentDueDay) : '',
          minimumPayment: dec(account.minimumPaymentMinor, account.currency),
          notes: account.notes,
        }
      : { name: '', kind: 'bank', provider: '', currency: settings.displayCurrency, openingBalance: '', last4: '', syncMode: 'manual', creditLimit: '', statementDay: '', paymentDueDay: '', minimumPayment: '', notes: '' },
  })
  const kind = useWatch({ control, name: 'kind' })
  const errors = formState.errors
  const save = useMutation((input: AccountInput) => (account ? repo.update('accounts', id, input) : repo.create('accounts', id, input)), {
    success: account ? 'accounts.form.updated' : 'accounts.form.created',
    errorPrefix: 'toast.couldNotSave',
  })
  const isCard = kind === 'credit-card' || kind === 'debit-card'

  const onSubmit = handleSubmit(async (v) => {
    const optional = (s: string) => {
      if (!s.trim()) return null
      const r = parseAmountToMinor(s, v.currency)
      return r.ok ? r.value : null
    }
    const opening = v.openingBalance.trim() ? parseSignedAmountToMinor(v.openingBalance, v.currency) : { ok: true as const, value: 0 }
    if (!opening.ok) return
    const input: AccountInput = {
      name: v.name.trim(),
      kind: v.kind,
      provider: v.provider.trim(),
      currency: v.currency,
      openingBalanceMinor: opening.value,
      last4: v.last4,
      syncMode: v.syncMode,
      creditLimitMinor: v.kind === 'credit-card' ? optional(v.creditLimit) : null,
      statementDay: v.kind === 'credit-card' && v.statementDay ? Number(v.statementDay) : null,
      paymentDueDay: v.kind === 'credit-card' && v.paymentDueDay ? Number(v.paymentDueDay) : null,
      minimumPaymentMinor: v.kind === 'credit-card' ? optional(v.minimumPayment) : null,
      archived: account?.archived ?? false,
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
        <FormField label={t('accounts.form.kind')}>
          <NativeSelect {...register('kind')}>
            {ACCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`accountKinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t('accounts.provider')} error={errors.provider?.message}>
          <Input autoComplete="off" {...register('provider')} />
        </FormField>
        <FormField label={t('common.currency')} error={errors.currency?.message}>
          <CurrencySelect {...register('currency')} />
        </FormField>
        <FormField label={t('accounts.opening')} error={errors.openingBalance?.message} hint={t('accounts.openingHint')}>
          <Input inputMode="decimal" dir="ltr" placeholder="0.00" className="tabular" {...register('openingBalance')} />
        </FormField>
        <FormField label={t('accounts.syncMode')}>
          <NativeSelect {...register('syncMode')}>
            {SYNC_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`syncModes.${m}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {isCard ? (
        <fieldset className="grid gap-4 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">{t('accounts.form.cardSection')}</legend>
          <FormField label={t('accounts.last4')} error={errors.last4?.message} hint={t('accounts.last4Hint')}>
            <Input inputMode="numeric" maxLength={4} dir="ltr" autoComplete="off" {...register('last4')} />
          </FormField>
          {kind === 'credit-card' ? (
            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('accounts.limit')} error={errors.creditLimit?.message}>
                <Input inputMode="decimal" dir="ltr" className="tabular" {...register('creditLimit')} />
              </FormField>
              <FormField label={t('accounts.minimumPayment')} error={errors.minimumPayment?.message}>
                <Input inputMode="decimal" dir="ltr" className="tabular" {...register('minimumPayment')} />
              </FormField>
              <FormField label={t('accounts.statementDay')} error={errors.statementDay?.message}>
                <Input inputMode="numeric" dir="ltr" {...register('statementDay')} />
              </FormField>
              <FormField label={t('accounts.dueDay')} error={errors.paymentDueDay?.message}>
                <Input inputMode="numeric" dir="ltr" {...register('paymentDueDay')} />
              </FormField>
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <FormField label={t('common.notesOptional')} error={errors.notes?.message}>
        <Textarea rows={2} {...register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={save.pending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.pending}>
          {save.pending ? <Loader2Icon className="animate-spin" /> : null}
          {account ? t('common.saveChanges') : t('accounts.add')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function AccountFormDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange(open: boolean): void; account?: Account }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? t('accounts.form.editTitle') : t('accounts.form.newTitle')}</DialogTitle>
          <DialogDescription>{t('accounts.form.text')}</DialogDescription>
        </DialogHeader>
        {open ? <AccountForm account={account} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
