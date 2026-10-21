import { Link } from 'react-router'
import { LanguageThemeToggles } from '@/components/layout/PublicHeader'
import { Logo } from '@/components/layout/Logo'
import { useI18n, type MessageKey } from '@/i18n'

const SECTIONS: [MessageKey, MessageKey][] = [
  ['privacy.storesTitle', 'privacy.storesText'],
  ['privacy.filesTitle', 'privacy.filesText'],
  ['privacy.notTitle', 'privacy.notText'],
  ['privacy.ratesTitle', 'privacy.ratesText'],
  ['privacy.demoTitle', 'privacy.demoText'],
  ['privacy.controlTitle', 'privacy.controlText'],
]

/** Plain-language description of what SpendWise stores and sends. Kept in sync with the implementation. */
export function PrivacyPage() {
  const { t } = useI18n()
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/" aria-label="SpendWise">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageThemeToggles />
        </div>
      </div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">{t('privacy.title')}</h1>
      <div className="mt-4 grid gap-4 text-sm leading-relaxed text-muted-foreground">
        {SECTIONS.map(([title, text]) => (
          <section key={title}>
            <h2 className="mb-1 font-semibold text-foreground">{t(title)}</h2>
            <p>{t(text)}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm">
        <Link to="/" className="font-medium text-primary hover:underline">
          {t('privacy.back')}
        </Link>
      </p>
    </main>
  )
}
