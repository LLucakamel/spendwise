import { DoorOpenIcon, Loader2Icon, LogOutIcon, MailCheckIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useSession } from '@/app/session'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormField } from '@/components/common/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useFormat } from '@/hooks/use-format'
import { useI18n, type MessageKey } from '@/i18n'
import { errorKey } from '@/lib/errors'

function DemoAccountSection() {
  const session = useSession()
  const { t } = useI18n()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const run = async (action: () => Promise<void>, success: MessageKey) => {
    try {
      await action()
      toast.success(t(success))
      return true
    } catch (error) {
      toast.error(t(errorKey(error)))
      return false
    }
  }

  return (
    <Card id="account" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.demoTitle')}</CardTitle>
        <CardDescription>{t('settings.demoText')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setConfirmReset(true)} data-testid="reset-demo">
          <RotateCcwIcon /> {t('settings.resetDemo')}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">
            <DoorOpenIcon /> {t('settings.exitDemo')}
          </Link>
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)} data-testid="clear-demo">
          <Trash2Icon /> {t('settings.clearDemo')}
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('settings.resetDemoTitle')}
        description={<p>{t('settings.resetDemoText')}</p>}
        confirmLabel={t('settings.reset')}
        destructive={false}
        onConfirm={() => run(() => session.resetDemo?.() ?? Promise.resolve(), 'settings.demoReset')}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('settings.clearDemoTitle')}
        description={<p>{t('settings.clearDemoText')}</p>}
        confirmLabel={t('settings.clearData')}
        onConfirm={() => run(() => session.deleteAccount(''), 'settings.demoCleared')}
      />
    </Card>
  )
}

function FirebaseAccountSection() {
  const session = useSession()
  const { account } = session
  const { t } = useI18n()
  const format = useFormat()
  const savedName = account.kind === 'firebase' ? (account.displayName ?? '') : ''
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [password, setPassword] = useState('')
  const [deleteError, setDeleteError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [name, setName] = useState(savedName)
  const [savingName, setSavingName] = useState(false)

  if (account.kind !== 'firebase') return null

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    if (!session.updateDisplayName) return
    setSavingName(true)
    try {
      await session.updateDisplayName(name.trim())
      toast.success(t('settings.nameUpdated'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setSavingName(false)
    }
  }

  const sendVerification = async () => {
    setSending(true)
    try {
      await session.resendVerification?.()
      toast.success(t('settings.verificationSent'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setSending(false)
    }
  }

  const memberSince = account.createdAt ? new Date(account.createdAt) : null

  return (
    <Card id="account" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{t('settings.account')}</CardTitle>
        <CardDescription>{t('settings.accountText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {session.updateDisplayName ? (
          <form onSubmit={saveName} className="flex flex-wrap items-end gap-2" data-testid="display-name-form">
            <FormField label={t('common.name')} className="min-w-56 flex-1">
              <Input autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <Button type="submit" variant="outline" disabled={savingName || name.trim() === savedName}>
              {savingName ? <Loader2Icon className="animate-spin" /> : null} {t('settings.saveName')}
            </Button>
          </form>
        ) : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">{t('settings.email')}</dt>
          <dd className="flex flex-wrap items-center gap-2 break-all">
            <span dir="ltr">{account.email}</span>
            {account.emailVerified ? (
              <Badge variant="outline">{t('settings.verified')}</Badge>
            ) : (
              <Badge variant="outline" className="text-warning">
                {t('settings.notVerified')}
              </Badge>
            )}
          </dd>
          {memberSince && !Number.isNaN(memberSince.getTime()) ? (
            <>
              <dt className="text-muted-foreground">{t('settings.memberSince')}</dt>
              <dd>{memberSince.toLocaleDateString(format.locale, { dateStyle: 'medium' })}</dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          {!account.emailVerified && session.resendVerification ? (
            <Button variant="outline" disabled={sending} onClick={() => void sendVerification()}>
              {sending ? <Loader2Icon className="animate-spin" /> : <MailCheckIcon />} {t('settings.sendVerification')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setConfirmSignOut(true)} data-testid="sign-out">
            <LogOutIcon /> {t('settings.signOut')}
          </Button>
        </div>
        <div className="rounded-lg border border-destructive/30 p-4">
          <p className="text-sm font-medium">{t('settings.deleteAccount')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.deleteAccountText')}</p>
          <Button variant="destructive" className="mt-3" onClick={() => setConfirmDelete(true)} data-testid="delete-account">
            <Trash2Icon /> {t('settings.deleteAccount')}
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={t('settings.signOutTitle')}
        description={<p>{t('settings.signOutText')}</p>}
        confirmLabel={t('settings.signOut')}
        destructive={false}
        onConfirm={async () => {
          try {
            await session.signOut()
            return true
          } catch (error) {
            toast.error(t(errorKey(error)))
            return false
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open)
          if (!open) {
            setPassword('')
            setDeleteError(undefined)
          }
        }}
        title={t('settings.deleteAccountTitle')}
        description={<p>{t('settings.deleteAccountConfirm')}</p>}
        confirmLabel={t('settings.deleteEverything')}
        onConfirm={async () => {
          if (!password) {
            setDeleteError('validation.passwordRequired')
            return false
          }
          try {
            await session.deleteAccount(password)
            toast.success(t('settings.accountDeleted'))
            return true
          } catch (error) {
            setDeleteError(errorKey(error))
            return false
          }
        }}
      >
        <FormField label={t('auth.password')} error={deleteError}>
          <Input type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </Card>
  )
}

export function AccountSection() {
  const { account } = useSession()
  return account.kind === 'demo' ? <DemoAccountSection /> : <FirebaseAccountSection />
}
