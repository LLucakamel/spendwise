import { useMemo, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useFinance } from '@/data/DataProvider'
import { currencyOptions } from '@/domain/currencies'
import { useCategoryLookup } from '@/hooks/use-format'
import { useI18n } from '@/i18n'
import { PERIOD_PRESETS, type DateRange, type PeriodPreset } from '@/lib/dates'
import { cn } from '@/lib/utils'

type SelectProps = Omit<ComponentProps<'select'>, 'children'>

export function CurrencySelect({ allowAll, ...props }: SelectProps & { allowAll?: boolean }) {
  const { t, language } = useI18n()
  const options = useMemo(() => currencyOptions(language === 'ar' ? 'ar' : 'en'), [language])
  return (
    <NativeSelect {...props}>
      {allowAll ? <option value="">{t('transactions.allCurrencies')}</option> : null}
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}

export function CategorySelect({
  type,
  allowAll,
  placeholder,
  ...props
}: SelectProps & { type?: 'income' | 'expense'; allowAll?: boolean; placeholder?: string }) {
  const { categories } = useFinance()
  const lookup = useCategoryLookup()
  const { t } = useI18n()
  const visible = categories
    .filter((c) => !type || c.type === type)
    .map((c) => ({ ...c, label: lookup.name(c.id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const groups: [string, typeof visible][] = type
    ? [['', visible]]
    : [
        [t('settings.expenseCategories'), visible.filter((c) => c.type === 'expense')],
        [t('settings.incomeCategories'), visible.filter((c) => c.type === 'income')],
      ]
  return (
    <NativeSelect {...props}>
      {allowAll ? <option value="">{t('transactions.allCategories')}</option> : null}
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {groups.map(([label, items]) =>
        label ? (
          <optgroup key={label} label={label}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ) : (
          items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))
        ),
      )}
    </NativeSelect>
  )
}

/** Account picker. `currency` limits the list to accounts in that currency. */
export function AccountSelect({ allowNone = true, emptyLabel, currency, ...props }: SelectProps & { allowNone?: boolean; emptyLabel?: string; currency?: string }) {
  const { accounts } = useFinance()
  const { t } = useI18n()
  const visible = accounts.filter((a) => !a.archived && (!currency || a.currency === currency))
  return (
    <NativeSelect {...props}>
      {allowNone ? <option value="">{emptyLabel ?? t('common.noAccount')}</option> : null}
      {visible.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.currency}
        </option>
      ))}
    </NativeSelect>
  )
}

export interface PeriodValue {
  preset: PeriodPreset
  range: DateRange
}

export function PeriodPicker({
  value,
  onPresetChange,
  onCustomChange,
  className,
}: {
  value: PeriodValue
  onPresetChange(preset: PeriodPreset): void
  onCustomChange(range: DateRange): void
  className?: string
}) {
  const { t } = useI18n()
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <div className="grid gap-1">
        <Label htmlFor="period-preset" className="text-xs text-muted-foreground">
          {t('periods.label')}
        </Label>
        <NativeSelect id="period-preset" value={value.preset} onChange={(e) => onPresetChange(e.target.value as PeriodPreset)} className="w-40">
          {PERIOD_PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`periods.${p}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {value.preset === 'custom' ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor="period-from" className="text-xs text-muted-foreground">
              {t('periods.from')}
            </Label>
            <Input
              id="period-from"
              type="date"
              className="w-40"
              value={value.range.from}
              max={value.range.to}
              onChange={(e) => e.target.value && onCustomChange({ ...value.range, from: e.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="period-to" className="text-xs text-muted-foreground">
              {t('periods.to')}
            </Label>
            <Input
              id="period-to"
              type="date"
              className="w-40"
              value={value.range.to}
              min={value.range.from}
              onChange={(e) => e.target.value && onCustomChange({ ...value.range, to: e.target.value })}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Segmented control to pick which currency a chart or summary shows. Hidden when only one exists. */
export function CurrencySwitcher({ currencies, value, onChange, label }: { currencies: string[]; value: string; onChange(currency: string): void; label?: string }) {
  const { t } = useI18n()
  if (currencies.length < 2) return null
  return (
    <div role="radiogroup" aria-label={label ?? t('dashboard.currencyShown')} className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {currencies.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          onClick={() => onChange(c)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            c === value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}
