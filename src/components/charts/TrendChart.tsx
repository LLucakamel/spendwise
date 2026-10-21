import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { useFormat } from '@/hooks/use-format'
import { formatBucketLabel, type Granularity } from '@/lib/dates'
import type { TimeBucket } from '@/lib/finance'
import { formatAxisValue, minorToNumber } from '@/lib/money'

interface Row {
  label: string
  value: number
  minor: number
}

/** Single-series line of spending over time (one currency). */
export function TrendChart({
  buckets,
  currency,
  granularity,
  seriesLabel,
  height = 240,
}: {
  buckets: TimeBucket[]
  currency: string
  granularity: Granularity
  seriesLabel: string
  height?: number
}) {
  const format = useFormat()
  const data: Row[] = buckets.map((b) => ({
    label: formatBucketLabel(b.start, granularity, format.locale),
    value: minorToNumber(b.expenseMinor, currency),
    minor: b.expenseMinor,
  }))

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const row = payload?.[0]?.payload as Row | undefined
    if (!active || !row) return null
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <p className="mb-1 font-medium">{granularity === 'week' ? `Week of ${row.label}` : row.label}</p>
        <p>
          {seriesLabel}: <span className="tabular font-medium">{format.money(row.minor, currency)}</span>
        </p>
      </div>
    )
  }

  return (
    <div style={{ height }} role="img" aria-label={`Line chart of ${seriesLabel.toLowerCase()} in ${currency} over time.`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisValue(value, currency, format.locale)}
          />
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
