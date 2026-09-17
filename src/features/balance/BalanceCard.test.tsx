import { screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatNaira } from '@/lib/money'
import { buildBalance } from '@/mocks/handlers/balance'
import { server } from '@/mocks/server'
import { GET_RETRY } from '@/api/baseApi'

/** Fails the next attempt AND its retries (network error), then falls through to the real handler. */
function networkDown(path: string) {
  let failures = 0
  server.use(
    http.get(path, () =>
      failures++ < GET_RETRY.maxRetries + 1 ? HttpResponse.error() : undefined,
    ),
  )
}
import { seedTestDb, TEST_NOW } from '@/test/api'
import { runAxe } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

import { BalanceCard } from './BalanceCard'

describe('BalanceCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => vi.useRealTimers())

  it('shows a labelled skeleton, then the formatted balance and today’s totals', async () => {
    renderWithProviders(<BalanceCard />)
    expect(screen.getByRole('status', { name: /loading balance/i })).toBeInTheDocument()

    const expected = buildBalance(TEST_NOW)
    expect(await screen.findByText(formatNaira(expected.available))).toBeInTheDocument()
    expect(
      screen.getByText(formatNaira(expected.today.inflow, { signDisplay: 'always' })),
    ).toBeInTheDocument()
    expect(screen.getByText(formatNaira(expected.today.outflow))).toBeInTheDocument()
    expect(screen.getByText(/today’s inflow/i)).toBeInTheDocument()
    expect(screen.getByText(/today’s outflow/i)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the server error message with a working Retry', async () => {
    server.use(
      http.get(
        '/api/balance',
        () =>
          HttpResponse.json(
            { error: { code: 'INTERNAL', message: 'Ledger unavailable', requestId: 'r1' } },
            { status: 500 },
          ),
        { once: true },
      ),
    )
    const { user } = renderWithProviders(<BalanceCard />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Ledger unavailable')
    await user.click(screen.getByRole('button', { name: /retry/i }))

    expect(
      await screen.findByText(formatNaira(buildBalance(TEST_NOW).available)),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('translates a network failure into a human message', async () => {
    networkDown('/api/balance')
    renderWithProviders(<BalanceCard />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })

  it('keeps stale data visible when a refresh fails', async () => {
    const { user } = renderWithProviders(<BalanceCard />)
    const expected = buildBalance(TEST_NOW)
    await screen.findByText(formatNaira(expected.available))

    networkDown('/api/balance')
    await user.click(screen.getByRole('button', { name: /refresh balance/i }))
    await waitFor(() => expect(screen.getByText(/couldn’t refresh/i)).toBeInTheDocument())
    expect(screen.getByText(formatNaira(expected.available))).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<BalanceCard />)
    await screen.findByText(formatNaira(buildBalance(TEST_NOW).available))
    expect(await runAxe(container)).toHaveNoViolations()
  })
})
