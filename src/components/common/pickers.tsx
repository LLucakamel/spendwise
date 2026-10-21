import { useMemo, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useFinance } from '@/data/DataProvider'
import { currencyOptions } from '@/domain/currencies'
import type { TransactionType } from '@/domain/types'
import { PERIOD_PRESET_LABELS, PERIOD_PRESETS, type DateRange, type PeriodPreset } from '@/lib/dates'
import { cn } from '@/lib/utils'

type SelectProps = Omit<ComponentProps<'select'>, 'children'>

export function CurrencySelect({ allowAll, ...props }: SelectProps & { allowAll?: boolean }) {
  const { settings } = useFinance()
  const options = useMemo(() => currencyOptions(settings.locale), [settings.locale])
  return (
    <NativeSelect {...props}>
      {allowAll ? <option value="">All currencies</option> : null}
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
}: SelectProps & { type?: TransactionType; allowAll?: boolean; placeholder?: string }) {
  const { categories } = useFinance()
  const visible = categories
    .filter((c) => !type || c.type === type)
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
  const groups: [string, typeof visible][] = type
    ? [['', visible]]
    : [
        ['Expense categories', visible.filter((c) => c.type === 'expense')],
        ['Income categories', visible.filter((c) => c.type === 'income')],
      ]
  return (
    <NativeSelect {...props}>
      {allowAll ? <option value="">All categories</option> : null}
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
                {c.name}
              </option>
            ))}
          </optgroup>
        ) : (
          items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))
        ),
      )}
    </NativeSelect>
  )
}

export interface PeriodValue {
  preset: PeriodPreset
  range: DateRange
}

/** Period preset selector with from/to inputs for a custom range. */
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
  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <div className="grid gap-1">
        <Label htmlFor="period-preset" className="text-xs text-muted-foreground">
          Period
        </Label>
        <NativeSelect
          id="period-preset"
          value={value.preset}
          onChange={(e) => onPresetChange(e.target.value as PeriodPreset)}
          className="w-40"
        >
          {PERIOD_PRESETS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_PRESET_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {value.preset === 'custom' ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor="period-from" className="text-xs text-muted-foreground">
              From
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
              To
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
export function CurrencySwitcher({
  currencies,
  value,
  onChange,
  label = 'Currency',
}: {
  currencies: string[]
  value: string
  onChange(currency: string): void
  label?: string
}) {
  if (currencies.length < 2) return null
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
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
