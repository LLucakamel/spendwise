import { AlertTriangleIcon, ArrowLeftRightIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useExchangeRates } from '@/hooks/use-exchange-rates'
import { useFormat } from '@/hooks/use-format'
import { convertTotals, isRateSupported, isRateTableStale, RATE_SOURCE } from '@/lib/exchangeRates'

/**
 * Optional, clearly labelled conversion of per-currency amounts into one currency.
 * Nothing is fetched until the user asks; original amounts are always shown alongside.
 */
export function ConvertedTotal({
  title,
  amounts,
  target,
}: {
  title: string
  amounts: { currency: string; amountMinor: number }[]
  target: string
}) {
  const format = useFormat()
  const [enabled, setEnabled] = useState(false)
  const currencies = amounts.map((a) => a.currency)
  const rates = useExchangeRates(target, currencies, enabled)
  const table = rates.table && rates.table.base === target ? rates.table : null
  const result = convertTotals(amounts, target, table)
  const unsupported = currencies.filter((c) => c !== target && !isRateSupported(c))
  const stale = table ? isRateTableStale(table) : false

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Approximate combined figure in {target}, using reference exchange rates. Your recorded amounts are never changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {!isRateSupported(target) ? (
          <p className="text-muted-foreground">
            {target} isn’t covered by the exchange-rate source ({RATE_SOURCE.name}), so totals stay separate by currency. Choose a supported display
            currency such as USD or EUR in Settings to see a converted total.
          </p>
        ) : !enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground">Only currency codes are sent to {RATE_SOURCE.name} — never your amounts.</p>
            <Button variant="outline" onClick={() => setEnabled(true)}>
              <ArrowLeftRightIcon /> Convert to {target}
            </Button>
          </div>
        ) : (
          <>
            {rates.status === 'loading' && !table ? (
              <p className="flex items-center gap-2 text-muted-foreground" role="status">
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> Loading exchange rates…
              </p>
            ) : null}
            {rates.status === 'error' ? (
              <p role="alert" className="flex gap-2 rounded-md bg-warning-soft px-3 py-2">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  {rates.error.message} {table ? 'Showing the last rates fetched successfully.' : 'Totals remain separate by currency.'}
                </span>
              </p>
            ) : null}
            {table || amounts.every((a) => a.currency === target) ? (
              <>
                <ul className="divide-y rounded-lg border">
                  {result.lines.map((line) => (
                    <li key={line.currency} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                      <span className="tabular">{format.money(line.amountMinor, line.currency)}</span>
                      <span className="text-xs text-muted-foreground">
                        {line.currency === target
                          ? 'no conversion'
                          : line.rate
                            ? `1 ${target} = ${line.rate} ${line.currency}`
                            : 'rate unavailable — not included'}
                      </span>
                      <span className="tabular font-medium">
                        {line.convertedMinor === null ? '—' : `≈ ${format.money(line.convertedMinor, target)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{result.complete ? 'Approximate total' : 'Approximate total (partial)'}</span>
                  <span className="text-lg font-semibold tabular">≈ {format.money(result.totalMinor, target)}</span>
                </p>
              </>
            ) : null}
            {unsupported.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Not convertible with this source: {unsupported.join(', ')}. Those amounts are excluded from the converted total and shown in their own
                currency elsewhere.
              </p>
            ) : null}
            {table ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Rates: {RATE_SOURCE.description}, dated {table.date ? format.date(table.date) : '—'} · via{' '}
                  <a href={RATE_SOURCE.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {RATE_SOURCE.name}
                  </a>{' '}
                  · fetched {format.timestamp(table.fetchedAt)}
                  {stale ? <strong className="ml-1 text-warning">· These rates may be out of date.</strong> : null}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void rates.refresh()} disabled={rates.status === 'loading'}>
                  <RefreshCwIcon className={rates.status === 'loading' ? 'animate-spin' : undefined} /> Refresh rates
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
