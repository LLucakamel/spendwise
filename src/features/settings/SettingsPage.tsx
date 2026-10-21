import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/common/states'
import { useI18n } from '@/i18n'
import { AccountSection } from './AccountSection'
import { AppearanceSection } from './AppearanceSection'
import { CategoryManager } from './CategoryManager'
import { DataSection } from './DataSection'
import { OpeningBalancesSection } from './OpeningBalancesSection'
import { PreferencesSection } from './PreferencesSection'

export function SettingsPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const section = params.get('section')
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' })
  }, [section])

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <div className="grid gap-4">
        <AppearanceSection />
        <PreferencesSection />
        <OpeningBalancesSection />
        <CategoryManager />
        <DataSection />
        <AccountSection />
      </div>
    </>
  )
}
