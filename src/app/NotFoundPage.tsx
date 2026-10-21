import { CompassIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={CompassIcon}
      title="Page not found"
      description="The page you’re looking for doesn’t exist or has moved."
      action={
        <Button asChild>
          <Link to="/">Go to the dashboard</Link>
        </Button>
      }
      className="py-24"
    />
  )
}
