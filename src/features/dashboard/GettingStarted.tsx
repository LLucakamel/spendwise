import { CheckCircle2Icon, PiggyBankIcon, PlusIcon, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAppPath, useRepository, useSession } from '@/app/session'
import { CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useFinance } from '@/data/DataProvider'
import { useMutation } from '@/hooks/use-mutation'

/** Short first-run checklist: preferred currency, first transaction, first budget. */
export function GettingStarted({ onAddTransaction }: { onAddTransaction(type: 'income' | 'expense'): void }) {
  const { settings, budgets } = useFinance()
  const { account } = useSession()
  const repo = useRepository()
  const appPath = useAppPath()
  const [currency, setCurrency] = useState(settings.displayCurrency)
  const save = useMutation((code: string) => repo.updateSettings({ displayCurrency: code }), { success: 'Preferred currency saved' })
  const name = account.kind === 'firebase' && account.displayName ? `, ${account.displayName.split(' ')[0]}` : ''

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <WalletIcon className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">Welcome to SpendWise{name}</CardTitle>
        <CardDescription>Three quick steps and your dashboard comes to life. Everything here is calculated from what you record.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-5">
          <li className="grid gap-2">
            <p className="text-sm font-medium">1. Choose your preferred currency</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="onboarding-currency" className="sr-only">
                  Preferred currency
                </Label>
                <CurrencySelect id="onboarding-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-72 max-w-full" />
              </div>
              <Button variant="outline" disabled={save.pending || currency === settings.displayCurrency} onClick={() => void save.run(currency)}>
                {currency === settings.displayCurrency ? <CheckCircle2Icon className="text-income" /> : null}
                {currency === settings.displayCurrency ? 'Saved' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Used as the default for new entries. You can record any currency on each transaction.</p>
          </li>
          <li className="grid gap-2">
            <p className="text-sm font-medium">2. Add your first transaction</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onAddTransaction('expense')}>
                <PlusIcon /> Add expense
              </Button>
              <Button variant="outline" onClick={() => onAddTransaction('income')}>
                <PlusIcon /> Add income
              </Button>
            </div>
          </li>
          <li className="grid gap-2">
            <p className="text-sm font-medium">3. Set a monthly budget</p>
            <div>
              <Button variant="outline" asChild>
                <Link to={appPath('/budgets')}>
                  {budgets.length > 0 ? <CheckCircle2Icon className="text-income" /> : <PiggyBankIcon />}
                  {budgets.length > 0 ? 'Budget created — view budgets' : 'Create a budget'}
                </Link>
              </Button>
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
