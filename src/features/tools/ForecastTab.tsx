import { useMemo, useState } from 'react'
import { TrendChart } from '@/components/charts/TrendChart'
import { Money } from '@/components/common/Money'
import { CurrencySwitcher } from '@/components/common/pickers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinance } from '@/data/DataProvider'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { fromIsoDate, todayIso } from '@/lib/dates'
import { balancesByCurrency } from '@/lib/finance'
import { cashFlowForecast } from '@/lib/tools'

export function ForecastTab() {
  const { transactions, accounts, recurringBills, incomeSources, settings } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const today = todayIso()
  const [chosen, setChosen] = useState<string | null>(null)

  const balances = useMemo(
    () => balancesByCurrency(transactions, settings.openingBalances, today, settings.displayCurrency, accounts),
    [transactions, settings.openingBalances, settings.displayCurrency, today, accounts],
  )
  const currencies = useMemo(() => {
    const set = new Set<string>([
      settings.displayCurrency,
      ...balances.map((b) => b.currency),
      ...recurringBills.filter((b) => b.status === 'active').map((b) => b.currency),
      ...incomeSources.filter((s) => s.status === 'active').map((s) => s.currency),
    ])
    return [...set].sort((a, b) => (a === settings.displayCurrency ? -1 : b === settings.displayCurrency ? 1 : a.localeCompare(b)))
  }, [balances, recurringBills, incomeSources, settings.displayCurrency])
  const currency = chosen && currencies.includes(chosen) ? chosen : settings.displayCurrency

  const startMinor = balances.find((b) => b.currency === currency)?.balanceMinor ?? 0
  const forecast = useMemo(
    () => cashFlowForecast(startMinor, currency, { recurringBills, incomeSources, transactions }, today),
    [startMinor, currency, recurringBills, incomeSources, transactions, today],
  )
  const dayLabel = useMemo(() => new Intl.DateTimeFormat(format.locale, { day: 'numeric', month: 'short' }), [format.locale])
  const points = forecast.points.map((p) => ({ label: dayLabel.format(fromIsoDate(p.date)), minor: p.balanceMinor }))
  const endMinor = forecast.points.at(-1)?.balanceMinor ?? startMinor
  const lowest = forecast.points.reduce<(typeof forecast.points)[number] | null>((low, p) => (low === null || p.balanceMinor < low.balanceMinor ? p : low), null)

  const stats = [
    { label: t('tools.forecast.start'), minor: startMinor, signed: true },
    { label: t('tools.forecast.plusIncome'), minor: forecast.incomeMinor, signed: false },
    { label: t('tools.forecast.minusBills'), minor: forecast.billsMinor, signed: false },
    { label: t('tools.forecast.end'), minor: endMinor, signed: true },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tools.forecast.title')}</CardTitle>
        <CardDescription>{t('tools.forecast.text', { currency })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <CurrencySwitcher currencies={currencies} value={currency} onChange={setChosen} />
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 text-lg font-semibold">
                <Money minor={s.minor} currency={currency} tone={s.signed ? 'signed' : undefined} />
              </dd>
            </div>
          ))}
        </dl>
        {lowest ? (
          <p className={lowest.balanceMinor < 0 ? 'text-sm font-medium text-expense' : 'text-sm text-muted-foreground'}>
            {t('tools.forecast.lowest', { amount: format.money(lowest.balanceMinor, currency), date: format.date(lowest.date) })}
          </p>
        ) : null}
        <TrendChart
          points={points}
          currency={currency}
          seriesLabel={t('tools.forecast.series')}
          zeroLine
          ariaLabel={t('tools.forecast.chartLabel', { currency })}
        />
      </CardContent>
    </Card>
  )
}
