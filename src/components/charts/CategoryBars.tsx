import { Link } from 'react-router'
import type { CategorySummary } from '@/lib/finance'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'

/**
 * Horizontal magnitude bars with direct labels (category, amount, share).
 * One hue encodes magnitude; the category's own colour is only a small identity dot beside its name.
 */
export function CategoryBars({
  items,
  currency,
  limit = 6,
  linkParams,
}: {
  items: CategorySummary[]
  currency: string
  limit?: number
  /** When given, each row links to the transactions list filtered to that category. */
  linkParams?: Record<string, string>
}) {
  const format = useFormat()
  const lookup = useCategoryLookup()
  const shown = items.slice(0, limit)
  const rest = items.slice(limit)
  const restTotal = rest.reduce((sum, i) => sum + i.totalMinor, 0)
  const restShare = rest.reduce((sum, i) => sum + i.share, 0)
  const max = Math.max(...shown.map((i) => i.totalMinor), restTotal, 1)

  const row = (key: string, name: string, color: string | null, totalMinor: number, share: number, href?: string) => {
    const content = (
      <>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {color ? <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" /> : null}
            <span className="truncate">{name}</span>
          </span>
          <span className="shrink-0 tabular">
            {format.money(totalMinor, currency)}
            <span className="ml-2 inline-block w-10 text-right text-xs text-muted-foreground">{Math.round(share * 100)}%</span>
          </span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-muted" aria-hidden="true">
          <div className="h-2 rounded-full bg-chart-bar" style={{ width: `${Math.max(2, (totalMinor / max) * 100)}%` }} />
        </div>
      </>
    )
    return (
      <li key={key}>
        {href ? (
          <Link to={href} className="block rounded-md p-1.5 -m-1.5 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {content}
          </Link>
        ) : (
          content
        )}
      </li>
    )
  }

  return (
    <ul className="grid gap-4">
      {shown.map((item) =>
        row(
          item.categoryId,
          lookup.name(item.categoryId),
          lookup.color(item.categoryId),
          item.totalMinor,
          item.share,
          linkParams ? `/transactions?${new URLSearchParams({ ...linkParams, category: item.categoryId, currency, type: 'expense' })}` : undefined,
        ),
      )}
      {rest.length > 0 ? row('other', `Other (${rest.length} categories)`, null, restTotal, restShare) : null}
    </ul>
  )
}
