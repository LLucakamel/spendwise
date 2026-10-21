import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { TestProviders } from '@/test/providers'
import { Root } from './Root'

const renderRoot = () => render(
  <TestProviders>
    <Root />
  </TestProviders>,
)

// The test environment has no VITE_FIREBASE_* variables, like a deployment without Firebase.
describe('top-level routing (hash based)', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('shows the landing page with an explicit demo entry and no sign-in when Firebase is not configured', async () => {
    renderRoot()
    expect(await screen.findByRole('heading', { level: 1, name: /Know where your money goes/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Try the demo/ })).toHaveAttribute('href', '#/demo')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getByText(/Account sign-up isn’t configured/)).toBeInTheDocument()
  })

  it('enters the demo only when the visitor chooses it', async () => {
    const user = userEvent.setup()
    renderRoot()
    await user.click(await screen.findByRole('link', { name: /Try the demo/ }))
    expect(window.location.hash).toBe('#/demo')
    expect(await screen.findByText(/^Demo mode/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('never falls back to demo data on account routes without Firebase', async () => {
    window.location.hash = '#/app/transactions'
    renderRoot()
    expect(await screen.findByText('Accounts aren’t available on this deployment')).toBeInTheDocument()
    expect(screen.queryByText(/^Demo mode/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try the demo instead' })).toHaveAttribute('href', '#/demo')
  })
})
