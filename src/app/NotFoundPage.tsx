import { CompassIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { useAppPath } from './session'

export function NotFoundPage() {
  const appPath = useAppPath()
  return (
    <EmptyState
      icon={CompassIcon}
      title="Page not found"
      description="The page you’re looking for doesn’t exist or has moved."
      action={
        <Button asChild>
          <Link to={appPath('/')}>Go to the dashboard</Link>
        </Button>
      }
      className="py-24"
    />
  )
}
