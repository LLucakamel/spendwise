import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestProviders } from '@/test/providers'

const authService = vi.hoisted(() => ({
  signIn: vi.fn(),
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
}))
vi.mock('@/data/firebase/authService', () => authService)
vi.mock('@/data/firebase/app', () => ({
  getFirebaseServices: () => ({ auth: { name: 'test-auth' } }),
}))

const { ForgotPasswordPage, LoginPage, RegisterPage } = await import('./AuthPages')

function renderAt(path: string) {
  const user = userEvent.setup()
  render(
    <TestProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/app" element={<p>Private dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </TestProviders>,
  )
  return user
}

const firebaseError = (code: string) => Object.assign(new Error(code), { code })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegisterPage', () => {
  it('validates every field before calling Firebase', async () => {
    const user = renderAt('/register')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Please confirm you’ve read the privacy notice.')).toBeInTheDocument()
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('shows live password requirements, mismatches and toggles visibility', async () => {
    const user = renderAt('/register')
    const password = screen.getByLabelText('Password')
    await user.type(password, 'abc')
    expect(screen.getByText('At least 8 characters').textContent).toContain('(not met)')
    expect(screen.getByText('At least one letter').textContent).toContain('(met)')
    await user.type(password, 'defgh1')
    expect(screen.getByText('At least one number').textContent).toContain('(met)')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getAllByRole('button', { name: 'Show password' })[0]!)
    expect(password).toHaveAttribute('type', 'text')

    await user.type(screen.getByLabelText('Confirm password'), 'different1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('The passwords don’t match.')).toBeInTheDocument()
  })

  it('registers once, then opens the private app', async () => {
    let resolve: () => void = () => undefined
    authService.register.mockImplementation(() => new Promise<void>((r) => (resolve = r)))
    const user = renderAt('/register')
    await user.type(screen.getByLabelText('Name'), 'Sam Example')
    await user.type(screen.getByLabelText('Email'), 'sam@example.test')
    await user.type(screen.getByLabelText('Password'), 'goodpass1')
    await user.type(screen.getByLabelText('Confirm password'), 'goodpass1')
    await user.click(screen.getByRole('checkbox'))
    const submit = screen.getByRole('button', { name: 'Create account' })
    await user.click(submit)
    await waitFor(() => expect(submit).toBeDisabled())
    await user.click(submit).catch(() => undefined)
    expect(authService.register).toHaveBeenCalledTimes(1)
    expect(authService.register).toHaveBeenCalledWith({ name: 'test-auth' }, 'Sam Example', 'sam@example.test', 'goodpass1')
    resolve()
    expect(await screen.findByText('Private dashboard')).toBeInTheDocument()
  })

  it('explains Firebase errors without exposing internals', async () => {
    authService.register.mockRejectedValue(firebaseError('auth/email-already-in-use'))
    const user = renderAt('/register')
    await user.type(screen.getByLabelText('Name'), 'Sam')
    await user.type(screen.getByLabelText('Email'), 'sam@example.test')
    await user.type(screen.getByLabelText('Password'), 'goodpass1')
    await user.type(screen.getByLabelText('Confirm password'), 'goodpass1')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.')
  })
})

describe('LoginPage', () => {
  it('passes the "keep me signed in" choice to Firebase persistence', async () => {
    authService.signIn.mockResolvedValue(undefined)
    const user = renderAt('/login')
    await user.type(screen.getByLabelText('Email'), 'sam@example.test')
    await user.type(screen.getByLabelText('Password'), 'goodpass1')
    await user.click(screen.getByLabelText('Keep me signed in'))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Private dashboard')).toBeInTheDocument()
    expect(authService.signIn).toHaveBeenCalledWith({ name: 'test-auth' }, 'sam@example.test', 'goodpass1', false)
  })

  it('shows a generic message for wrong credentials and stays on the page', async () => {
    authService.signIn.mockRejectedValue(firebaseError('auth/invalid-credential'))
    const user = renderAt('/login')
    await user.type(screen.getByLabelText('Email'), 'sam@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
    expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument()
  })
})

describe('ForgotPasswordPage', () => {
  it('confirms without revealing whether the account exists', async () => {
    authService.requestPasswordReset.mockRejectedValue(firebaseError('auth/user-not-found'))
    const user = renderAt('/forgot-password')
    await user.type(screen.getByLabelText('Email'), 'nobody@example.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists for nobody@example.test')
  })
})
