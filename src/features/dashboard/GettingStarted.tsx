import { CheckCircle2Icon, PiggyBankIcon, PlusIcon, TrendingUpIcon, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAppPath, useRepository, useSession } from '@/app/session'
import { CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useFinance } from '@/data/DataProvider'
import { useMutation } from '@/hooks/use-mutation'
import { useI18n } from '@/i18n'

/** Short first-run checklist: preferred currency, first transaction or income, first budget. */
export function GettingStarted({ onAddTransaction }: { onAddTransaction(type: 'income' | 'expense'): void }) {
  const { settings, budgets, incomeSources } = useFinance()
  const { account } = useSession()
  const repo = useRepository()
  const appPath = useAppPath()
  const { t } = useI18n()
  const [currency, setCurrency] = useState(settings.displayCurrency)
  const save = useMutation((code: string) => repo.updateSettings({ displayCurrency: code }), { success: 'dashboard.savedCurrency' })
  const firstName = account.kind === 'firebase' && account.displayName ? account.displayName.split(' ')[0] : ''
  const isSaved = currency === settings.displayCurrency

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <WalletIcon className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">{firstName ? t('dashboard.welcomeName', { name: firstName }) : t('dashboard.welcome')}</CardTitle>
        <CardDescription>{t('dashboard.welcomeText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-5">
          <li className="grid gap-2">
            <p className="text-sm font-medium">{t('dashboard.step1')}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="onboarding-currency" className="sr-only">
                  {t('settings.displayCurrency')}
                </Label>
                <CurrencySelect id="onboarding-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-72 max-w-full" />
              </div>
              <Button variant="outline" disabled={save.pending || isSaved} onClick={() => void save.run(currency)}>
                {isSaved ? <CheckCircle2Icon className="text-income" /> : null}
                {isSaved ? t('dashboard.saved') : t('common.save')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('dashboard.step1Hint')}</p>
          </li>
          <li className="grid gap-2">
            <p className="text-sm font-medium">{t('dashboard.step2')}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onAddTransaction('expense')}>
                <PlusIcon /> {t('dashboard.addExpense')}
              </Button>
              <Button variant="outline" onClick={() => onAddTransaction('income')}>
                <PlusIcon /> {t('dashboard.addIncome')}
              </Button>
              <Button variant="ghost" asChild>
                <Link to={appPath('/income')}>
                  {incomeSources.length > 0 ? <CheckCircle2Icon className="text-income" /> : <TrendingUpIcon />}
                  {t('dashboard.addIncomeSource')}
                </Link>
              </Button>
            </div>
          </li>
          <li className="grid gap-2">
            <p className="text-sm font-medium">{t('dashboard.step3')}</p>
            <div>
              <Button variant="outline" asChild>
                <Link to={appPath('/budgets')}>
                  {budgets.length > 0 ? <CheckCircle2Icon className="text-income" /> : <PiggyBankIcon />}
                  {budgets.length > 0 ? t('dashboard.budgetCreated') : t('dashboard.createBudget')}
                </Link>
              </Button>
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
