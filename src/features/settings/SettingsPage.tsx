import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/common/states'
import { AccountSection } from './AccountSection'
import { CategoryManager } from './CategoryManager'
import { DataSection } from './DataSection'
import { OpeningBalancesSection } from './OpeningBalancesSection'
import { AppearanceSection, PreferencesSection } from './PreferencesSection'

export function SettingsPage() {
  const [params] = useSearchParams()
  const section = params.get('section')
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' })
  }, [section])

  return (
    <>
      <PageHeader title="Settings" description="Personalise SpendWise and manage your data." />
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
