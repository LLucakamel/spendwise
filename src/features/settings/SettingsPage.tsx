import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { PageHeader } from '@/components/common/states'
import { AccountSection } from './AccountSection'
import { CategoryManager } from './CategoryManager'
import { DataSection } from './DataSection'
import { OpeningBalancesSection } from './OpeningBalancesSection'
import { AppearanceSection, PreferencesSection } from './PreferencesSection'

export function SettingsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

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
