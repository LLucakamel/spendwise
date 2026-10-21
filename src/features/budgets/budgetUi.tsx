import { AlertTriangleIcon, CheckCircle2Icon, OctagonAlertIcon } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { BudgetHealth } from '@/lib/finance'
import { cn } from '@/lib/utils'

export function budgetIndicatorClass(health: BudgetHealth): string {
  return health === 'over' ? 'bg-expense' : health === 'warning' ? 'bg-warning' : 'bg-primary'
}

const HEALTH_CONFIG = {
  ok: { icon: CheckCircle2Icon, cls: 'text-income' },
  warning: { icon: AlertTriangleIcon, cls: 'text-warning' },
  over: { icon: OctagonAlertIcon, cls: 'text-expense' },
} as const

/** Status shown with an icon and text, never colour alone. */
export function BudgetHealthBadge({ health, className }: { health: BudgetHealth; className?: string }) {
  const { t } = useI18n()
  const config = HEALTH_CONFIG[health]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium', config.cls, className)}>
      <config.icon className="size-3.5" aria-hidden="true" />
      {t(`budgets.health.${health}`)}
    </span>
  )
}
