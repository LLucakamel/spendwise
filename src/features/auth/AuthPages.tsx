import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2Icon, CircleIcon, FlaskConicalIcon, Loader2Icon, MailIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { FormField } from '@/components/common/FormField'
import { PasswordInput } from '@/components/common/PasswordInput'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getFirebaseServices } from '@/data/firebase/app'
import { register as registerUser, requestPasswordReset, signIn } from '@/data/firebase/authService'
import { APP_BASE } from '@/app/mode'
import { errorCode, friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  loginSchema,
  PASSWORD_RULES,
  registerSchema,
  resetSchema,
  type LoginValues,
  type RegisterValues,
  type ResetValues,
} from './authSchemas'

function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/" aria-label="SpendWise home" className="mb-6 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <Logo />
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <div className="mt-4 grid gap-2 text-center text-sm text-muted-foreground">
        {footer}
        <Link to="/demo" className="inline-flex items-center justify-center gap-1.5 text-xs hover:text-foreground">
          <FlaskConicalIcon className="size-3.5" aria-hidden="true" /> Just looking? Try the demo with fictional data
        </Link>
      </div>
    </main>
  )
}

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md bg-expense-soft px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  )
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string>()
  const { register, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  })
  const from = (location.state as { from?: string } | null)?.from
  const target = from?.startsWith(APP_BASE) ? from : APP_BASE

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined)
    try {
      await signIn(getFirebaseServices().auth, values.email, values.password, values.remember)
      navigate(target, { replace: true })
    } catch (e) {
      setError(friendlyError(e, 'Sign-in failed. Please try again.'))
    }
  })

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back. Sign in to see your finances."
      footer={
        <p>
          New to SpendWise?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormError message={error} />
        <FormField label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField label="Password" error={formState.errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </FormField>
        <div className="-mt-1 flex items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register('remember')} />
            Keep me signed in
          </label>
          <Link to="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton pending={formState.isSubmitting}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  )
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid gap-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        const Icon = ok ? CheckCircle2Icon : CircleIcon
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', ok ? 'text-income' : 'text-muted-foreground')}>
            <Icon className="size-3.5" aria-hidden="true" />
            {rule.label}
            <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const { register, handleSubmit, formState, control } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '', acceptPrivacy: false },
  })
  const password = useWatch({ control, name: 'password' }) ?? ''

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined)
    try {
      await registerUser(getFirebaseServices().auth, values.name, values.email, values.password)
      navigate(APP_BASE, { replace: true })
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t create your account. Please try again.'))
    }
  })

  return (
    <AuthShell
      title="Create your account"
      description="Track income, expenses, budgets and bills in one place."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormError message={error} />
        <FormField label="Name" error={formState.errors.name?.message}>
          <Input autoComplete="name" {...register('name')} />
        </FormField>
        <FormField label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField label="Password" error={formState.errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </FormField>
        <PasswordChecklist password={password} />
        <FormField label="Confirm password" error={formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirm')} />
        </FormField>
        <div className="grid gap-1">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...register('acceptPrivacy')} />
            <span>
              I’ve read the{' '}
              <Link to="/privacy" className="font-medium text-primary hover:underline">
                privacy notice
              </Link>{' '}
              and understand my records are stored in my SpendWise account.
            </span>
          </label>
          {formState.errors.acceptPrivacy ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {formState.errors.acceptPrivacy.message}
            </p>
          ) : null}
        </div>
        <SubmitButton pending={formState.isSubmitting}>Create account</SubmitButton>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const { register, handleSubmit, formState } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined)
    try {
      await requestPasswordReset(getFirebaseServices().auth, values.email)
      setSentTo(values.email)
    } catch (e) {
      // Don't reveal whether an account exists for this address.
      if (errorCode(e) === 'auth/user-not-found') setSentTo(values.email)
      else setError(friendlyError(e, 'We couldn’t send the reset email. Please try again.'))
    }
  })

  return (
    <AuthShell
      title="Reset your password"
      description="We’ll email you a link to choose a new password."
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div role="status" className="flex gap-3 text-sm">
          <MailIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p>
            If an account exists for <strong className="break-all">{sentTo}</strong>, a password reset link is on its way. Check your inbox and spam
            folder.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={error} />
          <FormField label="Email" error={formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...register('email')} />
          </FormField>
          <SubmitButton pending={formState.isSubmitting}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  )
}
