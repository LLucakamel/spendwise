import { useMemo, useState } from 'react'
import type { WeekStart } from '@/domain/types'
import { comparisonRange, presetRange, todayIso, type DateRange, type PeriodPreset } from '@/lib/dates'

export interface PeriodState {
  preset: PeriodPreset
  range: DateRange
  comparison: DateRange
  today: string
  setPreset(preset: PeriodPreset): void
  setCustomRange(range: DateRange): void
}

/** Period selection shared by the dashboard and analytics pages. */
export function usePeriod(initial: PeriodPreset = 'this-month', weekStartsOn: WeekStart = 1): PeriodState {
  const today = todayIso()
  const [preset, setPresetState] = useState<PeriodPreset>(initial)
  const [custom, setCustom] = useState<DateRange>(() => presetRange('last-30-days', today))

  return useMemo(() => {
    const range = preset === 'custom' ? custom : presetRange(preset, today, weekStartsOn)
    return {
      preset,
      range,
      comparison: comparisonRange(preset, range, today),
      today,
      setPreset: (next: PeriodPreset) => {
        if (next === 'custom' && preset !== 'custom') setCustom(range)
        setPresetState(next)
      },
      setCustomRange: (next: DateRange) =>
        setCustom(next.from <= next.to ? next : { from: next.to, to: next.from }),
    }
  }, [preset, custom, today, weekStartsOn])
}
