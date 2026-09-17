import { screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatLagosDateTime } from '@/lib/date'
import { formatNaira, subtractKobo, ZERO_KOBO } from '@/lib/money'
import { getDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { seedTestDb, TEST_NOW } from '@/test/api'
import { runAxe } from '@/test/axe'
import { renderWithProviders } from '@/test/render'

import { TransactionFeed } from './TransactionFeed'

const rows = () =>
  within(screen.getByTestId('transaction-list')).getAllByRole('button', { hidden: true })
const details = () => screen.getByTestId('transaction-details')

describe('Transaction details', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => vi.useRealTimers())

  it('opens from a row with the full record, puts the id in the URL, and closes on Escape', async () => {
    const { user } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const target = getDb().transactions[1]!

    await user.click(rows()[1]!)
    const dialog = await screen.findByRole('dialog')
    expect(window.location.search).toBe(`?txn=${target.id}`)

    const signed = target.type === 'debit' ? subtractKobo(ZERO_KOBO, target.amount) : target.amount
    expect(within(dialog).getByRole('heading')).toHaveTextContent(
      formatNaira(signed, { signDisplay: 'always' }),
    )
    expect(within(dialog).getByText(target.reference)).toBeInTheDocument()
    expect(within(dialog).getByText(target.id)).toBeInTheDocument()
    expect(within(dialog).getByText(target.counterparty.accountNumberMasked)).toBeInTheDocument()
    expect(within(dialog).getByText(formatLagosDateTime(target.createdAt))).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent(/(?<!\d)\d{10}(?!\d)/) // never a standalone 10-digit account number

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('is keyboard operable: Tab to a row, Enter opens, focus returns on close', async () => {
    const { user } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const first = rows()[0]!
    first.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(within(details()).getAllByRole('button', { name: /close/i }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(rows()[0]).toHaveFocus())
  })

  it('renders a hostile description as inert text in the details view', async () => {
    const { user } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    // Seed plants '<img src=x onerror=alert(1)>' on the first row.
    await user.click(rows()[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(dialog.querySelector('img')).toBeNull()
  })

  it('deep links: ?txn=id fetches a row the feed has not loaded, and back does not leave the app', async () => {
    const target = getDb().transactions[400]! // well past the first page
    window.history.replaceState(null, '', `/?txn=${target.id}`)
    const { user } = renderWithProviders(<TransactionFeed />)

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(target.reference)).toBeInTheDocument()

    const historyLength = window.history.length
    await user.click(within(details()).getAllByRole('button', { name: /close/i }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.location.search).toBe('')
    expect(window.history.length).toBe(historyLength) // replaced, not popped
  })

  it('shows a clear message for an unknown id', async () => {
    window.history.replaceState(null, '', '/?txn=txn_999999')
    renderWithProviders(<TransactionFeed />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/doesn’t exist/i)
    expect(within(details()).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('offers Retry when the lookup fails on the network', async () => {
    let failures = 0
    server.use(
      http.get('/api/transactions/:id', () => (failures++ < 3 ? HttpResponse.error() : undefined)),
    )
    const target = getDb().transactions[400]!
    window.history.replaceState(null, '', `/?txn=${target.id}`)
    const { user } = renderWithProviders(<TransactionFeed />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
    await user.click(within(details()).getByRole('button', { name: /retry/i }))
    expect(await within(details()).findByText(target.reference)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { user, baseElement } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    await user.click(rows()[2]!)
    await screen.findByRole('dialog')
    expect(await runAxe(baseElement)).toHaveNoViolations()
  })
})
