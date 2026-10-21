import { AlertTriangleIcon, CheckCircle2Icon, OctagonAlertIcon } from 'lucide-react'
import type { BudgetHealth } from '@/lib/finance'
import { cn } from '@/lib/utils'

export function budgetIndicatorClass(health: BudgetHealth): string {
  return health === 'over' ? 'bg-expense' : health === 'warning' ? 'bg-warning' : 'bg-primary'
}

/** Status shown with an icon and text, never colour alone. */
export function BudgetHealthBadge({ health, className }: { health: BudgetHealth; className?: string }) {
  const config = {
    ok: { icon: CheckCircle2Icon, label: 'On track', cls: 'text-income' },
    warning: { icon: AlertTriangleIcon, label: 'Near limit', cls: 'text-warning' },
    over: { icon: OctagonAlertIcon, label: 'Over budget', cls: 'text-expense' },
  }[health]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium', config.cls, className)}>
      <config.icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </span>
  )
}
