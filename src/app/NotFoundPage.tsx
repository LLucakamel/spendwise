import { CompassIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { useAppPath } from './session'

export function NotFoundPage() {
  const appPath = useAppPath()
  const { t } = useI18n()
  return (
    <EmptyState
      icon={CompassIcon}
      title={t('common.pageNotFound')}
      description={t('common.pageNotFoundText')}
      action={
        <Button asChild>
          <Link to={appPath('/')}>{t('common.goToDashboard')}</Link>
        </Button>
      }
      className="py-24"
    />
  )
}
