import { CheckCircle2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useAppPath } from '@/app/session'
import { Money } from '@/components/common/Money'
import { EmptyState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinance } from '@/data/DataProvider'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { fromIsoDate, toIsoDate, todayIso } from '@/lib/dates'
import { dataQuality, type QualityIssue } from '@/lib/tools'
import { addDays } from 'date-fns'

export function QualityTab() {
  const { transactions, categories, invoices, accounts } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const appPath = useAppPath()
  const today = todayIso()

  const issues = useMemo(
    () => dataQuality(transactions, new Set(categories.map((c) => c.id)), invoices, accounts.length > 0, today),
    [transactions, categories, invoices, accounts.length, today],
  )
  const txById = useMemo(() => new Map(transactions.map((tx) => [tx.id, tx])), [transactions])
  const invoiceById = useMemo(() => new Map(invoices.map((inv) => [inv.id, inv])), [invoices])

  const reviewPath = (issue: QualityIssue) => {
    if (issue.kind === 'unlinked-invoice') return appPath('/invoices')
    if (issue.kind === 'future-dated') return `${appPath('/transactions')}?from=${toIsoDate(addDays(fromIsoDate(today), 1))}&sort=date-asc`
    return appPath('/transactions')
  }

  const sample = (issue: QualityIssue, id: string) => {
    if (issue.kind === 'unlinked-invoice') {
      const inv = invoiceById.get(id)
      if (!inv) return null
      return {
        href: `${appPath('/invoices')}?open=${encodeURIComponent(id)}`,
        title: inv.merchant || inv.invoiceNumber || '—',
        date: inv.issueDate,
        minor: inv.totalMinor,
        currency: inv.currency,
      }
    }
    const tx = txById.get(id)
    if (!tx) return null
    return { href: `${appPath('/transactions')}?open=${encodeURIComponent(id)}`, title: tx.description, date: tx.date, minor: tx.amountMinor, currency: tx.currency }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tools.quality.title')}</CardTitle>
        <CardDescription>{t('tools.quality.text')}</CardDescription>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <EmptyState icon={CheckCircle2Icon} title={t('tools.quality.allGood')} />
        ) : (
          <ul className="grid gap-4">
            {issues.map((issue) => (
              <li key={issue.kind} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Badge variant="outline" className="tabular">
                      {format.number(issue.count)}
                    </Badge>
                    {t(`tools.quality.kinds.${issue.kind}`)}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to={reviewPath(issue)}>{t('tools.quality.review')}</Link>
                  </Button>
                </div>
                <ul className="mt-2 divide-y rounded-md border text-sm">
                  {issue.sampleIds.map((id) => {
                    const item = sample(issue, id)
                    if (!item) return null
                    return (
                      <li key={id}>
                        <Link to={item.href} className="flex items-baseline justify-between gap-3 px-3 py-1.5 hover:bg-muted/60">
                          <span className="min-w-0 truncate">
                            {item.title || '—'} <span className="text-xs text-muted-foreground">· {item.date ? format.date(item.date) : '—'}</span>
                          </span>
                          {item.minor !== null && item.currency ? <Money minor={item.minor} currency={item.currency} className="shrink-0 text-xs" /> : null}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
