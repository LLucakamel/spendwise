import { ArrowLeftRightIcon, CalendarClockIcon, PiggyBankIcon, SearchIcon, TagIcon, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAppPath } from '@/app/session'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useFinance } from '@/data/DataProvider'
import { useFormat } from '@/hooks/use-format'
import { searchEverything, type SearchResult, type SearchResultType } from '@/lib/globalSearch'
import { cn } from '@/lib/utils'

const TYPE_META: Record<SearchResultType, { label: string; icon: LucideIcon }> = {
  transaction: { label: 'Transactions', icon: ArrowLeftRightIcon },
  category: { label: 'Categories', icon: TagIcon },
  budget: { label: 'Budgets', icon: PiggyBankIcon },
  bill: { label: 'Recurring bills', icon: CalendarClockIcon },
}

function SearchPanel({ onDone }: { onDone(): void }) {
  const data = useFinance()
  const format = useFormat()
  const navigate = useNavigate()
  const appPath = useAppPath()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchEverything(data, query), [data, query])

  const open = (result: SearchResult) => {
    const params = new URLSearchParams(result.query).toString()
    navigate(`${appPath(result.path)}${params ? `?${params}` : ''}`)
    onDone()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      open(results[active])
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="global-search-results"
          aria-activedescendant={results[active] ? `search-result-${active}` : undefined}
          aria-label="Search transactions, categories, budgets and bills"
          placeholder="Search transactions, categories, budgets, bills…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-[60dvh] overflow-y-auto p-2">
        {query.trim().length < 2 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least two characters. Try a merchant, category or bill name.</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
            No matches for “{query.trim()}”.
          </p>
        ) : (
          <ul id="global-search-results" role="listbox" aria-label="Search results">
            {results.map((result, index) => {
              const meta = TYPE_META[result.type]
              const header = result.type !== results[index - 1]?.type ? meta.label : null
              return (
                <li key={`${result.type}-${result.id}`} role="presentation">
                  {header ? <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">{header}</p> : null}
                  <div
                    id={`search-result-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => open(result)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', index === active && 'bg-accent')}
                  >
                    <meta.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{result.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.subtitle}
                        {result.date ? ` · ${format.date(result.date)}` : ''}
                      </span>
                    </span>
                    {result.amountMinor !== undefined && result.currency ? (
                      <span className="shrink-0 text-sm tabular">{format.money(result.amountMinor, result.currency)}</span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search across your transactions, categories, budgets and recurring bills.</DialogDescription>
        {open ? <SearchPanel onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
