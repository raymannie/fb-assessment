import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/render'

import { THEME_STORAGE_KEY } from './theme'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('switches to dark, applies the class, and persists only the theme key', async () => {
    const { user } = renderWithProviders(<ThemeToggle />)

    const button = screen.getByRole('button', { name: /switch to dark theme/i })
    await user.click(button)

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(localStorage.length).toBe(1)
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument()
  })

  it('is keyboard operable', async () => {
    const { user } = renderWithProviders(<ThemeToggle />)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('starts from the persisted preference', () => {
    renderWithProviders(<ThemeToggle />, { preloadedState: { theme: { preference: 'dark' } } })
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument()
  })
})
