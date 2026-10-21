import { Loader2Icon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useRepository } from '@/app/session'
import { FormField } from '@/components/common/FormField'
import { CurrencySelect } from '@/components/common/pickers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { useFinance } from '@/data/DataProvider'
import { SUPPORTED_LOCALES } from '@/domain/defaults'
import { DATE_FORMATS, type DateFormatPreference, type Settings, type WeekStart } from '@/domain/types'
import { useMutation } from '@/hooks/use-mutation'
import { useTheme, type ThemePreference } from '@/hooks/use-theme'
import { formatDate, todayIso } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const THEMES: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>The theme is saved on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => setTheme(t.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                theme === t.value ? 'border-primary bg-primary/5 text-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <t.icon className="size-5" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function PreferencesSection() {
  const { settings } = useFinance()
  const repo = useRepository()
  const [draft, setDraft] = useState<Pick<Settings, 'displayCurrency' | 'locale' | 'dateFormat' | 'weekStartsOn'>>({
    displayCurrency: settings.displayCurrency,
    locale: settings.locale,
    dateFormat: settings.dateFormat,
    weekStartsOn: settings.weekStartsOn,
  })
  const save = useMutation((patch: Partial<Settings>) => repo.updateSettings(patch), {
    success: 'Preferences saved',
    errorPrefix: 'Couldn’t save your preferences.',
  })
  const dirty =
    draft.displayCurrency !== settings.displayCurrency ||
    draft.locale !== settings.locale ||
    draft.dateFormat !== settings.dateFormat ||
    draft.weekStartsOn !== settings.weekStartsOn

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await save.run(draft)
  }

  const today = todayIso()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          How amounts and dates are shown. Changing the display currency never changes or converts existing transactions — it only sets the
          default for new entries and which currency is shown first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Preferred display currency">
            <CurrencySelect value={draft.displayCurrency} onChange={(e) => setDraft({ ...draft, displayCurrency: e.target.value })} />
          </FormField>
          <FormField label="Language and region" hint={`Example: ${formatMoney(123456, draft.displayCurrency, draft.locale)}`}>
            <NativeSelect value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value })}>
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Date format">
            <NativeSelect value={draft.dateFormat} onChange={(e) => setDraft({ ...draft, dateFormat: e.target.value as DateFormatPreference })}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f === 'locale' ? `Regional default (${formatDate(today, 'locale', draft.locale)})` : formatDate(today, f, draft.locale)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="First day of the week" hint="Used for weekly chart groupings.">
            <NativeSelect value={String(draft.weekStartsOn)} onChange={(e) => setDraft({ ...draft, weekStartsOn: Number(e.target.value) as WeekStart })}>
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
              <option value="6">Saturday</option>
            </NativeSelect>
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!dirty || save.pending}>
              {save.pending ? <Loader2Icon className="animate-spin" /> : null}
              Save preferences
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
