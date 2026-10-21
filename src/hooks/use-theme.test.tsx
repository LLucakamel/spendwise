import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from './use-theme'

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <p>
        {theme}/{resolvedTheme}
      </p>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('light')}>light</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  it('defaults to the system theme', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByText('system/light')).toBeInTheDocument()
  })

  it('applies and persists a chosen theme, and restores it on the next load', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await user.click(screen.getByText('dark'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    unmount()

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByText('dark/dark')).toBeInTheDocument()
    await act(async () => {
      await user.click(screen.getByText('light'))
    })
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
