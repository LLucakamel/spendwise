import type { TransactionType } from '@/domain/types'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * Formatted amount. With `type`, income and refunds show "+" in the income colour, expenses "−" in the
 * expense colour (meaning never relies on colour alone), and transfers are neutral.
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
  const { language } = useI18n()
  let text: string
  let color = ''
  if (type === 'transfer') {
    // Transfers move money between own accounts: shown without a sign or income/expense colour.
    text = format.money(minor, currency, { compact })
  } else if (type) {
    const inflow = type === 'income' || type === 'refund'
    text = `${inflow ? '+' : '−'}${format.money(minor, currency, { compact })}`
    color = inflow ? 'text-income' : 'text-expense'
  } else if (tone === 'signed') {
    text = format.money(minor, currency, { compact, signDisplay: 'exceptZero' })
    color = minor > 0 ? 'text-income' : minor < 0 ? 'text-expense' : ''
  } else {
    text = format.money(minor, currency, { compact })
  }
  // Latin-formatted amounts stay left-to-right inside Arabic text; Arabic formats keep their own order.
  return <bdi dir={language === 'ar' ? 'rtl' : 'ltr'} className={cn('tabular whitespace-nowrap', color, className)}>{text}</bdi>
}
