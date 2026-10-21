import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, MailIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { FormField } from '@/components/common/FormField'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getFirebaseServices } from '@/data/firebase/app'
import { register as registerUser, requestPasswordReset, signIn } from '@/data/firebase/authService'
import { errorCode, friendlyError } from '@/lib/errors'

const email = z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.')

const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password.') })
const registerSchema = z
  .object({
    email,
    password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Use at most 128 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords don’t match.' })
const resetSchema = z.object({ email })

function AuthShell({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>
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

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string>()
  const { register, handleSubmit, formState } = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined)
    try {
      await signIn(getFirebaseServices().auth, values.email, values.password)
      navigate(from, { replace: true })
    } catch (e) {
      setError(friendlyError(e, 'Sign-in failed. Please try again.'))
    }
  })

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back. Sign in to see your finances."
      footer={
        <>
          New to SpendWise?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormError message={error} />
        <FormField label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField label="Password" error={formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const { register, handleSubmit, formState } = useForm<z.input<typeof registerSchema>>({ resolver: zodResolver(registerSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setError(undefined)
    try {
      await registerUser(getFirebaseServices().auth, values.email, values.password)
      navigate('/', { replace: true })
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t create your account. Please try again.'))
    }
  })

  return (
    <AuthShell
      title="Create your account"
      description="Track income, expenses, budgets and bills in one place."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <FormError message={error} />
        <FormField label="Email" error={formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField label="Password" error={formState.errors.password?.message} hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </FormField>
        <FormField label="Confirm password" error={formState.errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirm')} />
        </FormField>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const { register, handleSubmit, formState } = useForm<z.input<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })

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
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? <Loader2Icon className="animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
