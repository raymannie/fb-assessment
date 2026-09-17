import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/render'
import { runAxe } from '@/test/axe'

import { getMockConfig, MOCK_CONFIG_STORAGE_KEY } from './config'
import { getDb } from './db'
import DevSettingsPanel from './DevSettingsPanel'

describe('DevSettingsPanel', () => {
  it('edits the live config and persists it to sessionStorage only', async () => {
    const { user } = renderWithProviders(<DevSettingsPanel />)
    await user.click(screen.getByRole('button', { name: /mock api settings/i }))

    const failure = screen.getByLabelText(/read failure rate/i)
    await user.clear(failure)
    await user.type(failure, '40')
    expect(getMockConfig().failureRate).toBe(0.4)

    await user.selectOptions(screen.getByLabelText(/timeout mode/i), 'dropped')
    expect(getMockConfig().timeoutMode).toBe('dropped')

    await user.click(screen.getByRole('button', { name: /timeouts/i }))
    expect(getMockConfig().transferTimeoutRate).toBe(1)
    expect(getMockConfig().timeoutMode).toBe('committed')

    expect(JSON.parse(sessionStorage.getItem(MOCK_CONFIG_STORAGE_KEY)!)).toMatchObject({
      failureRate: 0.4,
    })
    expect(localStorage.length).toBe(0)

    await user.click(screen.getByRole('button', { name: /reset config/i }))
    expect(getMockConfig().failureRate).toBe(0)
    expect(sessionStorage.getItem(MOCK_CONFIG_STORAGE_KEY)).toBeNull()
  })

  it('re-seeds the database on "Reset data"', async () => {
    const { user } = renderWithProviders(<DevSettingsPanel />)
    const before = getDb()
    before.transactions.splice(0, 5)
    await user.click(screen.getByRole('button', { name: /mock api settings/i }))
    await user.click(screen.getByRole('button', { name: /reset data/i }))
    expect(getDb()).not.toBe(before)
    expect(getDb().transactions.length).toBeGreaterThanOrEqual(1500)
  })

  it('has no axe violations when open', async () => {
    const { user, baseElement } = renderWithProviders(<DevSettingsPanel />)
    await user.click(screen.getByRole('button', { name: /mock api settings/i }))
    expect(await runAxe(baseElement)).toHaveNoViolations()
  })
})
