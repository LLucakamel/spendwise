import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { formatAxisValue, minorToNumber } from '@/lib/money'

export interface TrendPoint {
  label: string
  minor: number
}

/** Single-series line for one currency (spending trend, cash-flow estimate). */
export function TrendChart({
  points,
  currency,
  seriesLabel,
  height = 240,
  zeroLine = false,
  ariaLabel,
}: {
  points: TrendPoint[]
  currency: string
  seriesLabel: string
  height?: number
  zeroLine?: boolean
  ariaLabel?: string
}) {
  const format = useFormat()
  const { t } = useI18n()
  const data = points.map((p) => ({ ...p, value: minorToNumber(p.minor, currency) }))

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const row = payload?.[0]?.payload as (TrendPoint & { value: number }) | undefined
    if (!active || !row) return null
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <p className="mb-1 font-medium">{row.label}</p>
        <p>
          {seriesLabel}: <span className="tabular font-medium">{format.money(row.minor, currency)}</span>
        </p>
      </div>
    )
  }

  return (
    <div style={{ height }} dir="ltr" role="img" aria-label={ariaLabel ?? t('charts.trendLabel', { series: seriesLabel, currency })}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={16} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={68}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisValue(value, currency, format.locale)}
          />
          {zeroLine ? <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" /> : null}
          <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }} />
          <Line
            type="monotone"
            dataKey="value"
            name={seriesLabel}
            stroke="var(--chart-bar)"
            strokeWidth={2}
            dot={data.length <= 16 ? { r: 4, strokeWidth: 2, fill: 'var(--card)' } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
