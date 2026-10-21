import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/common/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/i18n'
import { CalendarTab } from './CalendarTab'
import { DebtsTab } from './DebtsTab'
import { ForecastTab } from './ForecastTab'
import { GoalsTab } from './GoalsTab'
import { QualityTab } from './QualityTab'
import { ReportTab } from './ReportTab'

const TABS = ['goals', 'debts', 'calendar', 'forecast', 'report', 'quality'] as const
type ToolTab = (typeof TABS)[number]

function isToolTab(value: string | null): value is ToolTab {
  return value !== null && (TABS as readonly string[]).includes(value)
}

/** Planning tools. The active tab is kept in `?tab=` so each tool can be linked to directly. */
export function ToolsPage() {
  const { t, dir } = useI18n()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: ToolTab = isToolTab(requested) ? requested : 'goals'

  const selectTab = (value: string) => {
    if (!isToolTab(value)) return
    const next = new URLSearchParams(params)
    next.set('tab', value)
    setParams(next, { replace: true })
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader title={t('tools.title')} description={t('tools.subtitle')} />
      </div>
      <Tabs value={tab} onValueChange={selectTab} dir={dir} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1 print:hidden">
          <TabsList>
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`tools.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="goals">
          <GoalsTab />
        </TabsContent>
        <TabsContent value="debts">
          <DebtsTab />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab />
        </TabsContent>
        <TabsContent value="forecast">
          <ForecastTab />
        </TabsContent>
        <TabsContent value="report">
          <ReportTab />
        </TabsContent>
        <TabsContent value="quality">
          <QualityTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
