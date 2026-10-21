import { LanguagesIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSession } from '@/app/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Language } from '@/domain/types'
import { useTheme, type ThemePreference } from '@/hooks/use-theme'
import { useI18n, type MessageKey } from '@/i18n'
import { cn } from '@/lib/utils'

const THEMES: { value: ThemePreference; label: MessageKey; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'settings.light', icon: SunIcon },
  { value: 'dark', label: 'settings.dark', icon: MoonIcon },
  { value: 'system', label: 'settings.system', icon: MonitorIcon },
]

const LANGUAGES: { value: Language; label: MessageKey }[] = [
  { value: 'en', label: 'header.switchToEnglish' },
  { value: 'ar', label: 'header.switchToArabic' },
]

function Choice({ checked, onSelect, lang, children }: { checked: boolean; onSelect(): void; lang?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      lang={lang}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        checked ? 'border-primary bg-primary/5 text-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

export function AppearanceSection() {
  const { mode, repository } = useSession()
  const { t, language, setLanguage } = useI18n()
  const { theme, setTheme } = useTheme()

  const chooseLanguage = (next: Language) => {
    if (next === language) return
    setLanguage(next)
    // Saved with the account (or demo sandbox) too; the device choice still applies if this fails.
    repository.updateSettings({ language: next }).catch(() => undefined)
  }

  return (
    <Card id="appearance" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.appearance')}</CardTitle>
        <CardDescription>{t('settings.appearanceText', { account: mode === 'firebase' ? t('settings.andAccount') : '' })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <p id="settings-theme-label" className="text-sm font-medium">
            {t('settings.theme')}
          </p>
          <div role="radiogroup" aria-labelledby="settings-theme-label" className="grid max-w-md grid-cols-3 gap-2" data-testid="theme-options">
            {THEMES.map((option) => (
              <Choice key={option.value} checked={theme === option.value} onSelect={() => setTheme(option.value)}>
                <option.icon className="size-5" aria-hidden="true" />
                {t(option.label)}
              </Choice>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <p id="settings-language-label" className="text-sm font-medium">
            {t('settings.language')}
          </p>
          <div role="radiogroup" aria-labelledby="settings-language-label" className="grid max-w-md grid-cols-2 gap-2" data-testid="language-options">
            {LANGUAGES.map((option) => (
              <Choice key={option.value} checked={language === option.value} lang={option.value} onSelect={() => chooseLanguage(option.value)}>
                <LanguagesIcon className="size-5" aria-hidden="true" />
                {t(option.label)}
              </Choice>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
