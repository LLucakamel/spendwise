import {
  ArrowLeftRightIcon,
  CalendarClockIcon,
  PiggyBankIcon,
  ReceiptTextIcon,
  SearchIcon,
  TagIcon,
  TrendingUpIcon,
  WalletCardsIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAppPath } from '@/app/session'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useFinance } from '@/data/DataProvider'
import type { AccountKind, BillFrequency, IncomeFrequency, TransactionType } from '@/domain/types'
import { useCategoryLookup, useFormat } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { SEARCH_TYPES, searchEverything, type SearchResult, type SearchResultType } from '@/lib/globalSearch'
import { cn } from '@/lib/utils'

const ICONS: Record<SearchResultType, LucideIcon> = {
  transaction: ArrowLeftRightIcon,
  income: TrendingUpIcon,
  invoice: ReceiptTextIcon,
  budget: PiggyBankIcon,
  bill: CalendarClockIcon,
  account: WalletCardsIcon,
  category: TagIcon,
}

function SearchPanel({ onDone }: { onDone(): void }) {
  const data = useFinance()
  const format = useFormat()
  const lookup = useCategoryLookup()
  const navigate = useNavigate()
  const appPath = useAppPath()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchResultType | 'all'>('all')
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchEverything(data, query, lookup.name, filter === 'all' ? SEARCH_TYPES : [filter]), [data, query, lookup, filter])

  const subtitle = (r: SearchResult): string => {
    switch (r.type) {
      case 'transaction':
        return `${t(`types.${r.detail as TransactionType}`)} · ${lookup.name(r.categoryId ?? '')}`
      case 'income':
        return `${t(`frequencies.${r.detail as IncomeFrequency}`)} · ${lookup.name(r.categoryId ?? '')}`
      case 'invoice':
        return r.detail ? `#${r.detail}` : t('nav.invoices')
      case 'budget':
        return t('search.budgetLine', { category: lookup.name(r.categoryId ?? '') })
      case 'bill':
        return t(`frequencies.${r.detail as BillFrequency}`)
      case 'account':
        return `${t(`accountKinds.${r.detail as AccountKind}`)} · ${r.currency}`
      case 'category':
        return t('search.categoryLine', { type: t(`types.${r.detail as 'income' | 'expense'}`), count: r.amountMinor ?? 0 })
    }
  }

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
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
      <div role="group" aria-label={t('common.filters')} className="flex gap-1 overflow-x-auto border-b px-3 py-2">
        {(['all', ...SEARCH_TYPES] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={filter === type}
            onClick={() => {
              setFilter(type)
              setActive(0)
            }}
            className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium', filter === type ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {type === 'all' ? t('search.filterAll') : t(`search.groups.${type}`)}
          </button>
        ))}
      </div>
      <div className="max-h-[60dvh] overflow-y-auto p-2">
        {query.trim().length < 2 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('search.hint')}</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">
            {t('search.noMatches', { query: query.trim() })}
          </p>
        ) : (
          <ul id="global-search-results" role="listbox" aria-label={t('search.results')}>
            {results.map((result, index) => {
              const Icon = ICONS[result.type]
              const header = result.type !== results[index - 1]?.type ? t(`search.groups.${result.type}`) : null
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
                    <Icon className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{result.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {subtitle(result)}
                        {result.date ? ` · ${format.date(result.date)}` : ''}
                      </span>
                    </span>
                    {result.amountMinor !== undefined && result.currency ? <span className="shrink-0 text-sm tabular">{format.money(result.amountMinor, result.currency)}</span> : null}
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
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[10%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('search.description')}</DialogDescription>
        {open ? <SearchPanel onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}
