import { AlertCircleIcon, CheckCircle2Icon, CircleDashedIcon, CircleIcon, XCircleIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n'
import type { InvoicePaymentState } from '@/lib/invoice/invoices'
import { cn } from '@/lib/utils'

/** Status with icon and text. "Paid" distinguishes a linked payment from a status the user only stated. */
export function InvoiceStatusBadge({ state, confirmed }: { state: InvoicePaymentState; confirmed: boolean }) {
  const { t } = useI18n()
  const config = {
    paid: { icon: CheckCircle2Icon, cls: 'text-income border-income/40', label: confirmed ? t('invoices.confirmedPaid') : t('invoices.statedPaid') },
    'partially-paid': { icon: CircleDashedIcon, cls: 'text-warning border-warning/40', label: t('invoices.status.partially-paid') },
    unpaid: { icon: CircleIcon, cls: '', label: t('invoices.status.unpaid') },
    overdue: { icon: AlertCircleIcon, cls: 'text-expense border-expense/40', label: t('invoices.status.overdue') },
    cancelled: { icon: XCircleIcon, cls: 'text-muted-foreground', label: t('invoices.status.cancelled') },
  }[state]
  return (
    <Badge variant="outline" className={cn('gap-1', config.cls)}>
      <config.icon aria-hidden="true" /> {config.label}
    </Badge>
  )
}
