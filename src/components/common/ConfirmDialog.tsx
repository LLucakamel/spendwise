import { Loader2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

/** Confirmation for destructive actions. Stays open while the action runs and closes when it returns true. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm(): Promise<boolean>
  children?: ReactNode
}) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      if (await onConfirm()) onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {confirmLabel ?? t('common.delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
