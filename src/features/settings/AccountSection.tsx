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
import { friendlyError } from '@/lib/errors'

export function AccountSection() {
  const session = useSession()
  const { account } = session
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [password, setPassword] = useState('')
  const [deleteError, setDeleteError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [name, setName] = useState(account.kind === 'firebase' ? (account.displayName ?? '') : '')
  const [savingName, setSavingName] = useState(false)

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    if (!session.updateDisplayName) return
    setSavingName(true)
    try {
      await session.updateDisplayName(name)
      toast.success('Name updated')
    } catch (error) {
      toast.error(friendlyError(error))
    } finally {
      setSavingName(false)
    }
  }

  if (account.kind === 'demo') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Demo session</CardTitle>
          <CardDescription>
            You’re exploring SpendWise with fictional data stored only in this browser. There is no account, and nothing is uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcwIcon /> Reset sample data
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">
              <DoorOpenIcon /> Exit demo
            </Link>
          </Button>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon /> Clear all demo data
          </Button>
        </CardContent>
        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="Reset the demo?"
          description={<p>All demo changes are discarded and the original fictional sample data is restored.</p>}
          confirmLabel="Reset"
          destructive={false}
          onConfirm={async () => {
            await session.resetDemo?.()
            toast.success('Demo data reset')
            return true
          }}
        />
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Clear all demo data?"
          description={<p>Removes every demo transaction, budget and bill so you can try SpendWise from an empty state. Default categories are kept.</p>}
          confirmLabel="Clear data"
          onConfirm={async () => {
            await session.deleteAccount('')
            toast.success('Demo data cleared')
            return true
          }}
        />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your sign-in details and account controls.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {session.updateDisplayName ? (
          <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
            <FormField label="Name" className="min-w-56 flex-1">
              <Input autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <Button type="submit" variant="outline" disabled={savingName || name.trim() === (account.displayName ?? '')}>
              {savingName ? <Loader2Icon className="animate-spin" /> : null} Save name
            </Button>
          </form>
        ) : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="flex flex-wrap items-center gap-2 break-all">
            {account.email}
            {account.emailVerified ? <Badge variant="outline">Verified</Badge> : <Badge variant="outline" className="text-warning">Not verified</Badge>}
          </dd>
          {account.createdAt ? (
            <>
              <dt className="text-muted-foreground">Member since</dt>
              <dd>{new Date(account.createdAt).toLocaleDateString()}</dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          {!account.emailVerified && session.resendVerification ? (
            <Button
              variant="outline"
              disabled={sending}
              onClick={async () => {
                setSending(true)
                try {
                  await session.resendVerification?.()
                  toast.success('Verification email sent')
                } catch (error) {
                  toast.error(friendlyError(error))
                } finally {
                  setSending(false)
                }
              }}
            >
              {sending ? <Loader2Icon className="animate-spin" /> : <MailCheckIcon />} Send verification email
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setConfirmSignOut(true)}>
            <LogOutIcon /> Sign out
          </Button>
        </div>
        <div className="rounded-lg border border-destructive/30 p-4">
          <p className="text-sm font-medium">Delete account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanently deletes all of your transactions, budgets, bills, categories and settings, then your sign-in account. This can’t be undone.
            Download a backup first if you want to keep your data.
          </p>
          <Button variant="destructive" className="mt-3" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon /> Delete account
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description={<p>You’ll need your email and password to sign in again.</p>}
        confirmLabel="Sign out"
        destructive={false}
        onConfirm={async () => {
          try {
            await session.signOut()
            return true
          } catch (error) {
            toast.error(friendlyError(error))
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
        title="Delete your account permanently?"
        description={<p>Enter your password to confirm. All of your SpendWise data will be erased.</p>}
        confirmLabel="Delete everything"
        onConfirm={async () => {
          if (!password) {
            setDeleteError('Enter your password.')
            return false
          }
          try {
            await session.deleteAccount(password)
            toast.success('Your account and data were deleted')
            return true
          } catch (error) {
            setDeleteError(friendlyError(error))
            return false
          }
        }}
      >
        <FormField label="Password" error={deleteError}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
      </ConfirmDialog>
    </Card>
  )
}
