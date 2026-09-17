import { screen, within } from '@testing-library/react'
import { runAxe } from '@/test/axe'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/render'

import App from './App'

describe('App shell', () => {
  it('renders the landmarks, headings and primary action', () => {
    renderWithProviders(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /available balance/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /transactions/i })).toBeInTheDocument()
    // One CTA in the header (≥sm) and one in the mobile bottom bar; both are real buttons.
    expect(screen.getAllByRole('button', { name: /send money/i })).toHaveLength(2)
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#main',
    )
  })

  it('opens the lazy Send Money dialog from the CTA', async () => {
    const { user } = renderWithProviders(<App />)
    const [cta] = screen.getAllByRole('button', { name: /send money/i })
    await user.click(cta!)

    const dialog = await screen.findByRole('dialog', { name: /who are you sending to/i })
    expect(within(dialog).getByText(/step 1 of 4/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/account number/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<App />)
    expect(await runAxe(container)).toHaveNoViolations()
  })
})
