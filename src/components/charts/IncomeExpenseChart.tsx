import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { formatBucketLabel, type Granularity } from '@/lib/dates'
import type { TimeBucket } from '@/lib/finance'
import { formatAxisValue, minorToNumber } from '@/lib/money'

interface Row {
  label: string
  income: number
  expense: number
  incomeMinor: number
  expenseMinor: number
  netMinor: number
}

/**
 * Grouped bars of income and expenses per bucket, for one currency. Colours were validated for
 * colour-vision deficiency; a legend and tooltip carry the labels. The time axis stays left-to-right
 * in both languages.
 */
export function IncomeExpenseChart({
  buckets,
  currency,
  granularity,
  height = 260,
  showExpenses = true,
}: {
  buckets: TimeBucket[]
  currency: string
  granularity: Granularity
  height?: number
  showExpenses?: boolean
}) {
  const format = useFormat()
  const { t } = useI18n()
  const data: Row[] = buckets.map((b) => ({
    label: formatBucketLabel(b.start, granularity, format.locale),
    income: minorToNumber(b.incomeMinor, currency),
    expense: minorToNumber(b.expenseMinor, currency),
    incomeMinor: b.incomeMinor,
    expenseMinor: b.expenseMinor,
    netMinor: b.netMinor,
  }))

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const row = payload?.[0]?.payload as Row | undefined
    if (!active || !row) return null
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <p className="mb-1 font-medium">{granularity === 'week' ? t('dashboard.weekOf', { date: row.label }) : row.label}</p>
        <p className="flex items-center gap-2">
          <span className="size-2 rounded-sm bg-chart-income" aria-hidden="true" />
          {t('dashboard.seriesIncome')} <span className="ms-auto ps-4 tabular">{format.money(row.incomeMinor, currency)}</span>
        </p>
        {showExpenses ? (
          <>
            <p className="flex items-center gap-2">
              <span className="size-2 rounded-sm bg-chart-expense" aria-hidden="true" />
              {t('dashboard.seriesExpenses')} <span className="ms-auto ps-4 tabular">{format.money(row.expenseMinor, currency)}</span>
            </p>
            <p className="mt-1 flex border-t pt-1 text-muted-foreground">
              {t('dashboard.seriesNet')} <span className="ms-auto ps-4 tabular">{format.money(row.netMinor, currency, { signDisplay: 'exceptZero' })}</span>
            </p>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div style={{ height }} dir="ltr" role="img" aria-label={t('charts.incomeExpensesLabel', { currency })}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={12} interval="preserveStartEnd" />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={68}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickFormatter={(value: number) => formatAxisValue(value, currency, format.locale)}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="square"
            itemSorter={null}
            iconSize={10}
            formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
          />
          <Bar dataKey="income" name={t('dashboard.seriesIncome')} fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          {showExpenses ? <Bar dataKey="expense" name={t('dashboard.seriesExpenses')} fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} /> : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
