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
import { parseSignedAmountToMinor } from '@/lib/money'

export function OpeningBalancesSection() {
  const { settings } = useFinance()
  const repo = useRepository()
  const [currency, setCurrency] = useState(settings.displayCurrency)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string>()
  const save = useMutation((openingBalances: OpeningBalance[]) => repo.updateSettings({ openingBalances }), {
    success: 'Opening balances saved',
    errorPrefix: 'Couldn’t save the opening balance.',
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
        <CardTitle>Opening balances</CardTitle>
        <CardDescription>
          The amount you had in each currency before your first recorded transaction. Current balance = opening balance + income − expenses up to
          today.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {settings.openingBalances.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {settings.openingBalances.map((b) => (
              <li key={b.currency} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium">{b.currency}</span>
                <span className="flex items-center gap-2">
                  <Money minor={b.amountMinor} currency={b.currency} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${b.currency} opening balance`}
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
          <p className="text-sm text-muted-foreground">No opening balances yet.</p>
        )}
        <form onSubmit={submit} className="grid items-start gap-3 sm:grid-cols-[1.3fr_1fr_auto]" noValidate>
          <FormField label="Currency">
            <CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </FormField>
          <FormField label="Amount" error={error} hint="Use a minus sign for a negative balance.">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="tabular" />
          </FormField>
          <Button type="submit" className="sm:mt-[1.375rem]" disabled={save.pending}>
            {save.pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            {settings.openingBalances.some((b) => b.currency === currency) ? 'Update' : 'Add'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
