import { screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb } from '@/mocks/db'
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
import { BalanceCard } from '@/features/balance/BalanceCard'

import { TransactionFeed } from './TransactionFeed'

const list = () => screen.getByRole('list', { name: /transactions/i })
const rows = () => within(list()).getAllByRole('listitem')

describe('TransactionFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => vi.useRealTimers())

  it('shows a labelled skeleton, then the newest rows with masked accounts and text+icon status', async () => {
    renderWithProviders(<TransactionFeed />)
    expect(screen.getByRole('status', { name: /loading transactions/i })).toBeInTheDocument()

    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    const first = getDb().transactions[0]!
    const firstRow = rows()[0]!
    expect(firstRow).toHaveTextContent(first.counterparty.accountNumberMasked)
    expect(firstRow).not.toHaveTextContent(/\d{10}/)
    expect(within(firstRow).getByText(/successful|pending|failed/i)).toBeInTheDocument()
    expect(
      within(firstRow)
        .getByText(/successful|pending|failed/i)
        .querySelector('svg'),
    ).not.toBeNull()
    // Virtualized: far fewer DOM rows than the 50 loaded.
    expect(rows().length).toBeLessThan(50)
  })

  it('renders hostile descriptions as inert text with invisible characters stripped', async () => {
    server.use(
      http.get(
        '/api/transactions',
        () =>
          HttpResponse.json({
            items: [
              {
                ...getDb().transactions[0]!,
                id: 'h1',
                description: '<img src=x onerror=alert(1)>',
              },
              {
                ...getDb().transactions[1]!,
                id: 'h2',
                description: 'Payment \u202Egnp.exe\u202C invoice',
              },
              { ...getDb().transactions[2]!, id: 'h3', description: 'Refund\u200B\u200B pending' },
            ],
            nextCursor: null,
          }),
        { once: true },
      ),
    )
    const { container } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows()).toHaveLength(3))

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Payment gnp.exe invoice')).toBeInTheDocument()
    expect(screen.getByText('Refund pending')).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/[\u202E\u200B]/u)
  })

  it('filters by status, syncs the URL, and clears', async () => {
    const { user } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))

    await user.selectOptions(screen.getByLabelText(/status/i), 'failed')
    expect(window.location.search).toBe('?status=failed')
    await waitFor(() => {
      for (const row of rows()) expect(row).toHaveTextContent('Failed')
    })
    const expected = getDb().transactions.filter((t) => t.status === 'failed')
    expect(rows()[0]).toHaveTextContent(expected[0]!.counterparty.accountNumberMasked)

    await user.selectOptions(screen.getByLabelText(/type/i), 'credit')
    expect(window.location.search).toBe('?status=failed&type=credit')
    expect(screen.getByRole('button', { name: /clear filters \(2\)/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(window.location.search).toBe('')
    await waitFor(() =>
      expect(rows()[0]).toHaveTextContent(
        getDb().transactions[0]!.counterparty.accountNumberMasked,
      ),
    )
  })

  it('reads filters from the URL on load and follows back/forward navigation', async () => {
    window.history.replaceState(null, '', '/?type=debit')
    renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    expect(screen.getByLabelText(/type/i)).toHaveValue('debit')
    const debits = getDb().transactions.filter((t) => t.type === 'debit')
    expect(rows()[0]).toHaveTextContent(debits[0]!.counterparty.accountNumberMasked)

    window.history.replaceState(null, '', '/?type=credit')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(screen.getByLabelText(/type/i)).toHaveValue('credit'))
  })

  it('loads the next page from the keyboard-reachable button and announces it', async () => {
    const { user } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))

    const button = screen.getByRole('button', { name: /load more/i })
    await user.click(button)
    await waitFor(() =>
      expect(screen.getByText(/loaded 50 more\. showing 100 transactions\./i)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /load more/i })).toBeEnabled()
  })

  it('shows "no results" with a clear action for filters that match nothing', async () => {
    window.history.replaceState(null, '', '/?from=2020-01-01&to=2020-01-02')
    const { user } = renderWithProviders(<TransactionFeed />)

    const title = await screen.findByText(/no transactions match these filters/i)
    const empty = title.closest('[role="status"]')!
    expect(empty).toHaveTextContent(/try widening the date range/i)
    await user.click(within(empty as HTMLElement).getByRole('button', { name: /clear filters/i }))
    expect(window.location.search).toBe('')
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
  })

  it('shows the empty state when the account has no transactions at all', async () => {
    server.use(
      http.get('/api/transactions', () => HttpResponse.json({ items: [], nextCursor: null })),
    )
    renderWithProviders(<TransactionFeed />)
    const title = await screen.findByText(/no transactions yet/i)
    expect(title.closest('[role="status"]')).toHaveTextContent(/will show up here/i)
  })

  it('shows an error with Retry, then recovers', async () => {
    server.use(
      http.get(
        '/api/transactions',
        () =>
          HttpResponse.json(
            { error: { code: 'INTERNAL', message: 'Feed unavailable', requestId: 'r' } },
            { status: 500 },
          ),
        { once: true },
      ),
    )
    const { user } = renderWithProviders(<TransactionFeed />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Feed unavailable')
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps loaded rows and offers "Try again" when the next page fails', async () => {
    const { user } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))

    networkDown('/api/transactions')
    await user.click(screen.getByRole('button', { name: /load more/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t load more/i)
    expect(rows().length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.getByText(/showing 100 transactions/i)).toBeInTheDocument())
  })

  it('does not re-render the feed when the balance refetches', async () => {
    const feedRenders = vi.fn()
    const { user } = renderWithProviders(
      <>
        <BalanceCard />
        <Profiler id="feed" onRender={feedRenders}>
          <TransactionFeed />
        </Profiler>
      </>,
    )
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    await screen.findByText(/today’s inflow/i)
    feedRenders.mockClear()

    await user.click(screen.getByRole('button', { name: /refresh balance/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /refresh balance/i })).toBeEnabled(),
    )

    expect(feedRenders).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<TransactionFeed />)
    await waitFor(() => expect(rows().length).toBeGreaterThan(0))
    expect(await runAxe(container)).toHaveNoViolations()
  })
})
