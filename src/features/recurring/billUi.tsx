import { AlertCircleIcon, CalendarCheckIcon, ClockIcon, PauseCircleIcon, StopCircleIcon } from 'lucide-react'
import type { RecurringBill } from '@/domain/types'
import { useI18n } from '@/i18n'
import { billTiming, daysUntil, type BillTiming } from '@/lib/recurring'
import { cn } from '@/lib/utils'

const TIMING_STYLE: Record<BillTiming, { icon: typeof ClockIcon; cls: string }> = {
  overdue: { icon: AlertCircleIcon, cls: 'bg-expense-soft text-expense' },
  'due-today': { icon: ClockIcon, cls: 'bg-warning-soft text-foreground' },
  'due-soon': { icon: ClockIcon, cls: 'bg-warning-soft text-foreground' },
  scheduled: { icon: CalendarCheckIcon, cls: 'bg-muted text-muted-foreground' },
  paused: { icon: PauseCircleIcon, cls: 'bg-muted text-muted-foreground' },
  ended: { icon: StopCircleIcon, cls: 'bg-muted text-muted-foreground' },
}

export function BillTimingBadge({ bill, today, className }: { bill: Pick<RecurringBill, 'status' | 'nextDueDate'>; today: string; className?: string }) {
  const { t } = useI18n()
  const timing = billTiming(bill, today)
  const days = daysUntil(bill.nextDueDate, today)
  const label = {
    overdue: () => t('bills.timing.overdue', { count: -days }),
    'due-today': () => t('bills.timing.today'),
    'due-soon': () => t('bills.timing.soon', { count: days }),
    scheduled: () => t('bills.timing.scheduled', { count: days }),
    paused: () => t('bills.timing.paused'),
    ended: () => t('bills.timing.ended'),
  }[timing]()
  const style = TIMING_STYLE[timing]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', style.cls, className)}>
      <style.icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}
