import { Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { Money } from '@/components/common/Money'
import { CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useFinance } from '@/data/DataProvider'
import type { OpeningBalance } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'
import { parseSignedAmountToMinor } from '@/lib/money'

/** Opening balances that aren't tied to a tracked account. */
export function OpeningBalancesSection() {
  const { settings } = useFinance()
  const repo = useRepository()
  const { t } = useI18n()
  const [currency, setCurrency] = useState(settings.displayCurrency)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string>()
  const save = useMutation((openingBalances: OpeningBalance[]) => repo.updateSettings({ openingBalances }), {
    success: 'settings.balancesSaved',
    errorPrefix: 'toast.couldNotSave',
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseSignedAmountToMinor(amount, currency)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(undefined)
    const next = [...settings.openingBalances.filter((b) => b.currency !== currency), { currency, amountMinor: parsed.value }]
    const outcome = await save.run(next.sort((a, b) => a.currency.localeCompare(b.currency)))
    if (outcome.status !== 'error') setAmount('')
  }

  return (
    <Card id="balances" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.balances')}</CardTitle>
        <CardDescription>{t('settings.balancesText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {settings.openingBalances.length > 0 ? (
          <ul className="divide-y rounded-lg border" data-testid="opening-balances">
            {settings.openingBalances.map((b) => (
              <li key={b.currency} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium" dir="ltr">
                  {b.currency}
                </span>
                <span className="flex items-center gap-2">
                  <Money minor={b.amountMinor} currency={b.currency} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('settings.removeBalance', { currency: b.currency })}
                    disabled={save.pending}
                    onClick={() => void save.run(settings.openingBalances.filter((x) => x.currency !== b.currency))}
                  >
                    <Trash2Icon />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.noBalances')}</p>
        )}
        <form onSubmit={submit} className="grid items-start gap-3 sm:grid-cols-[1.3fr_1fr_auto]" noValidate>
          <FormField label={t('common.currency')}>
            <CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </FormField>
          <FormField label={t('common.amount')} error={error} hint={t('settings.negativeHint')}>
            <Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="tabular" />
          </FormField>
          <Button type="submit" className="sm:mt-[1.375rem]" disabled={save.pending}>
            {save.pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {settings.openingBalances.some((b) => b.currency === currency) ? t('settings.update') : t('common.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
