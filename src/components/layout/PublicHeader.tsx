import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { useI18n } from '@/i18n'

/** Language and theme toggles for public pages (landing, sign-in), saved on this device. */
export function LanguageThemeToggles() {
  const { t, language, setLanguage } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')} aria-label={t('header.language')} lang={language === 'ar' ? 'en' : 'ar'}>
        {language === 'ar' ? t('header.switchToEnglish') : t('header.switchToArabic')}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} aria-label={resolvedTheme === 'dark' ? t('header.themeLight') : t('header.themeDark')}>
        {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </Button>
    </>
  )
}
