import { AlertCircleIcon, CalendarCheckIcon, ClockIcon, PauseCircleIcon, StopCircleIcon } from 'lucide-react'
import type { RecurringBill } from '@/domain/types'
import { billTiming, daysUntil } from '@/lib/recurring'
import { cn } from '@/lib/utils'

export function BillTimingBadge({ bill, today, className }: { bill: Pick<RecurringBill, 'status' | 'nextDueDate'>; today: string; className?: string }) {
  const timing = billTiming(bill, today)
  const days = daysUntil(bill.nextDueDate, today)
  const config = {
    overdue: { icon: AlertCircleIcon, label: `Overdue by ${-days} day${days === -1 ? '' : 's'}`, cls: 'bg-expense-soft text-expense' },
    'due-today': { icon: ClockIcon, label: 'Due today', cls: 'bg-warning-soft text-foreground' },
    'due-soon': { icon: ClockIcon, label: `Due in ${days} day${days === 1 ? '' : 's'}`, cls: 'bg-warning-soft text-foreground' },
    scheduled: { icon: CalendarCheckIcon, label: `In ${days} days`, cls: 'bg-muted text-muted-foreground' },
    paused: { icon: PauseCircleIcon, label: 'Paused', cls: 'bg-muted text-muted-foreground' },
    ended: { icon: StopCircleIcon, label: 'Ended', cls: 'bg-muted text-muted-foreground' },
  }[timing]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', config.cls, className)}>
      <config.icon className="size-3" aria-hidden="true" />
      {config.label}
    </span>
  )
}
