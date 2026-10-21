import { Loader2Icon } from 'lucide-react'
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
import { useI18n, type MessageKey } from '@/i18n'
import { formatDate, todayIso } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

type Draft = Pick<Settings, 'displayCurrency' | 'locale' | 'dateFormat' | 'weekStartsOn'>

const WEEK_STARTS: { value: WeekStart; label: MessageKey }[] = [
  { value: 1, label: 'settings.monday' },
  { value: 0, label: 'settings.sunday' },
  { value: 6, label: 'settings.saturday' },
]

export function PreferencesSection() {
  const { settings } = useFinance()
  const repo = useRepository()
  const { t, formatLocale } = useI18n()
  const [draft, setDraft] = useState<Draft>({
    displayCurrency: settings.displayCurrency,
    locale: settings.locale,
    dateFormat: settings.dateFormat,
    weekStartsOn: settings.weekStartsOn,
  })
  const save = useMutation((patch: Partial<Settings>) => repo.updateSettings(patch), {
    success: 'settings.preferencesSaved',
    errorPrefix: 'toast.couldNotSave',
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
  const dateLocale = formatLocale(draft.locale)
  return (
    <Card id="preferences" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.preferences')}</CardTitle>
        <CardDescription>{t('settings.preferencesText')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="preferences-form">
          <FormField label={t('settings.displayCurrency')}>
            <CurrencySelect value={draft.displayCurrency} onChange={(e) => setDraft({ ...draft, displayCurrency: e.target.value })} />
          </FormField>
          <FormField
            label={t('settings.region')}
            hint={t('settings.regionHint', { example: formatMoney(123456, draft.displayCurrency, draft.locale) })}
          >
            <NativeSelect value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value })} dir="ltr">
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('settings.dateFormat')}>
            <NativeSelect value={draft.dateFormat} onChange={(e) => setDraft({ ...draft, dateFormat: e.target.value as DateFormatPreference })}>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f === 'locale' ? t('settings.regional', { example: formatDate(today, 'locale', dateLocale) }) : formatDate(today, f, dateLocale)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('settings.weekStart')} hint={t('settings.weekStartHint')}>
            <NativeSelect
              value={String(draft.weekStartsOn)}
              onChange={(e) => setDraft({ ...draft, weekStartsOn: Number(e.target.value) as WeekStart })}
            >
              {WEEK_STARTS.map((w) => (
                <option key={w.value} value={String(w.value)}>
                  {t(w.label)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!dirty || save.pending}>
              {save.pending ? <Loader2Icon className="animate-spin" /> : null}
              {t('settings.savePreferences')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
