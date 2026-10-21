import { CalendarDaysIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useAppPath } from '@/app/session'
import { Money } from '@/components/common/Money'
import { EmptyState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFinance } from '@/data/DataProvider'
import type { IsoDate } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { fromIsoDate, toIsoDate, todayIso } from '@/lib/dates'
import { calendarEvents, type CalendarEvent } from '@/lib/tools'
import { addDays } from 'date-fns'

const HORIZON_DAYS = 60

function eventPath(event: CalendarEvent): string {
  switch (event.kind) {
    case 'bill':
      return '/bills'
    case 'income':
      return `/income?source=${encodeURIComponent(event.refId)}`
    case 'card-due':
      return '/accounts'
    case 'invoice-due':
    case 'warranty':
    case 'return':
      return `/invoices?open=${encodeURIComponent(event.refId)}`
  }
}

export function CalendarTab() {
  const { recurringBills, incomeSources, invoices, accounts, transactions } = useFinance()
  const { t } = useI18n()
  const format = useFormat()
  const appPath = useAppPath()
  const today = todayIso()

  const groups = useMemo(() => {
    const range = { from: today, to: toIsoDate(addDays(fromIsoDate(today), HORIZON_DAYS)) }
    const events = calendarEvents({ recurringBills, incomeSources, invoices, accounts, transactions }, range, today)
    const byDate = new Map<IsoDate, CalendarEvent[]>()
    for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event])
    return [...byDate.entries()]
  }, [recurringBills, incomeSources, invoices, accounts, transactions, today])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tools.calendar.title')}</CardTitle>
        <CardDescription>{t('tools.calendar.text')}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <EmptyState icon={CalendarDaysIcon} title={t('tools.calendar.empty')} />
        ) : (
          <ol className="grid gap-5">
            {groups.map(([date, events]) => (
              <li key={date}>
                <h3 className="mb-2 text-sm font-semibold">
                  <time dateTime={date}>{format.date(date)}</time>
                  {date === today ? <span className="ms-2 text-xs font-normal text-muted-foreground">{t('bills.timing.today')}</span> : null}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {events.map((event) => (
                    <li key={`${event.kind}-${event.refId}`}>
                      <Link
                        to={appPath(eventPath(event))}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge variant={event.kind === 'income' ? 'secondary' : 'outline'} className="shrink-0">
                            {t(`tools.calendar.kinds.${event.kind}`)}
                          </Badge>
                          <span className="truncate">{event.title || '—'}</span>
                        </span>
                        {event.amountMinor !== null && event.currency ? (
                          <Money minor={event.amountMinor} currency={event.currency} type={event.kind === 'income' ? 'income' : 'expense'} className="shrink-0" />
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
