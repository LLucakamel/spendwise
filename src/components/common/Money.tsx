import type { TransactionType } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'

/**
 * Formatted amount. With `type`, income is shown with a "+" in the income colour and
 * expenses with a "−" in the expense colour, so meaning never relies on colour alone.
 */
export function Money({
  minor,
  currency,
  type,
  tone,
  compact,
  className,
}: {
  minor: number
  currency: string
  type?: TransactionType
  tone?: 'signed' | 'neutral'
  compact?: boolean
  className?: string
}) {
  const format = useFormat()
  let text: string
  let color = ''
  if (type) {
    text = `${type === 'income' ? '+' : '−'}${format.money(minor, currency, { compact })}`
    color = type === 'income' ? 'text-income' : 'text-expense'
  } else if (tone === 'signed') {
    text = format.money(minor, currency, { compact, signDisplay: 'exceptZero' })
    color = minor > 0 ? 'text-income' : minor < 0 ? 'text-expense' : ''
  } else {
    text = format.money(minor, currency, { compact })
  }
  return <span className={cn('tabular whitespace-nowrap', color, className)}>{text}</span>
}
