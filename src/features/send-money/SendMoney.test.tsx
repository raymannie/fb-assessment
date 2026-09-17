import { screen, waitFor, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { formatNaira, toKobo } from '@/lib/money'
import { setMockConfig } from '@/mocks/config'
import { availableBalance, getDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { seedTestDb, TEST_NOW } from '@/test/api'
import { runAxe } from '@/test/axe'
import { renderWithProviders } from '@/test/render'
import {
  confirmButton,
  continueToConfirm,
  dialog,
  fillAmount,
  fillRecipient,
  openSendMoney,
  reachConfirm,
  RECIPIENT_NAME,
} from '@/test/sendMoney'

import { selectIdempotencyKey } from './sendMoneySlice'

const AMOUNT = toKobo(250_000) // ₦2,500.00

/** Records every POST /transfers the server sees (method + Idempotency-Key). */
function recordTransferRequests() {
  const posts: { key: string | null }[] = []
  const listener = ({ request }: { request: Request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/transfers') {
      posts.push({ key: request.headers.get('idempotency-key') })
    }
  }
  server.events.on('request:start', listener)
  return { posts, stop: () => server.events.removeListener('request:start', listener) }
}

// While the dialog is open Radix marks the rest of the page aria-hidden (correct for AT), which
// also hides it from role queries — so background assertions use test ids.
const feedList = () => screen.getByTestId('transaction-list')
const feedRows = () => within(feedList()).getAllByRole('listitem', { hidden: true })
const firstRow = () => feedRows()[0]!
const balanceRegion = () => screen.getByTestId('balance-card')

async function renderApp() {
  const utils = renderWithProviders(<App />)
  await waitFor(() => expect(feedRows().length).toBeGreaterThan(0))
  await within(balanceRegion()).findByText(formatNaira(availableBalance(getDb())))
  return utils
}

describe('Send Money', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
    window.history.replaceState(null, '', '/')
    // Fast, deterministic timeouts and polling for the unknown-outcome paths.
    setMockConfig({ clientTransferTimeoutMs: 150, pollBaseMs: 5 })
  })
  afterEach(() => vi.useRealTimers())

  describe('validation per step', () => {
    it('recipient: requires a 10-digit account and a bank, links errors to fields, enables Next only after name enquiry', async () => {
      const { user } = await renderApp()
      await openSendMoney(user)
      const account = within(dialog()).getByLabelText(/account number/i)
      const next = within(dialog()).getByRole('button', { name: /^next$/i })
      expect(next).toBeDisabled()

      await user.type(account, '123')
      await user.tab()
      const error = await within(dialog()).findByText(/enter the 10-digit account number/i)
      expect(account).toHaveAttribute('aria-invalid', 'true')
      expect(account).toHaveAttribute('aria-describedby', error.id)

      await user.clear(account)
      await user.type(account, '0123454821')
      await user.selectOptions(within(dialog()).getByLabelText(/^bank$/i), '058')
      expect(await within(dialog()).findByText(RECIPIENT_NAME)).toBeInTheDocument()
      await waitFor(() => expect(next).toBeEnabled())
    })

    it('recipient: shows "not found" and keeps Next disabled', async () => {
      const { user } = await renderApp()
      await openSendMoney(user)
      await user.type(within(dialog()).getByLabelText(/account number/i), '0123454820')
      await user.selectOptions(within(dialog()).getByLabelText(/^bank$/i), '058')
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/no account found/i)
      expect(within(dialog()).getByRole('button', { name: /^next$/i })).toBeDisabled()
    })

    it('recipient: name enquiry failure (past the GET retry budget) offers Try again', async () => {
      let failures = 0
      server.use(
        http.get('/api/recipients/resolve', () => {
          failures += 1
          return failures <= 3 ? HttpResponse.error() : undefined // 1 try + 2 retries fail, then fall through
        }),
      )
      const { user } = await renderApp()
      await openSendMoney(user)
      await user.type(within(dialog()).getByLabelText(/account number/i), '0123454821')
      await user.selectOptions(within(dialog()).getByLabelText(/^bank$/i), '058')
      expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/couldn’t look up/i)
      await user.click(within(dialog()).getByRole('button', { name: /try again/i }))
      expect(await within(dialog()).findByText(RECIPIENT_NAME)).toBeInTheDocument()
    })

    it.each([
      ['', /enter an amount/i],
      ['abc', /enter a valid amount/i],
      ['1.999', /at most 2 decimal places/i],
      ['-5', /can’t be negative/i],
      ['0', /minimum transfer is ₦1\.00/i],
      ['0.50', /minimum transfer is ₦1\.00/i],
      ['5,000,001', /maximum per transfer is ₦5,000,000\.00/i],
      ['3,000,000', /exceeds your available balance/i],
    ])('amount: rejects %s', async (input, message) => {
      const { user } = await renderApp()
      await openSendMoney(user)
      await fillRecipient(user)
      const amount = within(dialog()).getByLabelText(/amount/i)
      if (input) await user.type(amount, input)
      await user.click(within(dialog()).getByRole('button', { name: /^next$/i }))
      const error = await within(dialog()).findByText(message)
      expect(amount).toHaveAttribute('aria-invalid', 'true')
      expect(amount.getAttribute('aria-describedby')).toContain(error.id)
      expect(screen.getByRole('dialog', { name: /how much/i })).toBeInTheDocument()
    })

    it('amount: accepts "1,000.50" and shows it on Review; Back preserves values', async () => {
      const { user } = await renderApp()
      await openSendMoney(user)
      await fillRecipient(user)
      await fillAmount(user, '1,000.50', 'Rent')
      expect(within(dialog()).getByText('₦1,000.50')).toBeInTheDocument()
      expect(within(dialog()).getByText('Rent')).toBeInTheDocument()

      await user.click(within(dialog()).getByRole('button', { name: /^back$/i }))
      await screen.findByRole('dialog', { name: /how much/i })
      expect(within(dialog()).getByLabelText(/amount/i)).toHaveValue('1,000.50')
      expect(within(dialog()).getByLabelText(/narration/i)).toHaveValue('Rent')

      await user.click(within(dialog()).getByRole('button', { name: /^back$/i }))
      await screen.findByRole('dialog', { name: /who are you sending to/i })
      expect(within(dialog()).getByLabelText(/account number/i)).toHaveValue('0123454821')
      expect(within(dialog()).getByLabelText(/^bank$/i)).toHaveValue('058')
    })
  })

  it('moves focus to the step heading on every step change', async () => {
    const { user } = await renderApp()
    await openSendMoney(user)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /who are you sending to/i })).toHaveFocus(),
    )
    await fillRecipient(user)
    await waitFor(() => expect(screen.getByRole('heading', { name: /how much/i })).toHaveFocus())
    await fillAmount(user, '2,500')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /review transfer/i })).toHaveFocus(),
    )
  })

  it('can be completed with the keyboard only', async () => {
    const { user, store } = await renderApp()
    // Header CTA is the first focusable after the skip link.
    await user.tab()
    await user.tab()
    expect(screen.getAllByRole('button', { name: /send money/i })[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: /who are you sending to/i })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /who are you sending to/i })).toHaveFocus(),
    )

    await user.tab() // heading → account number
    expect(within(dialog()).getByLabelText(/account number/i)).toHaveFocus()
    await user.keyboard('0123454821')
    await user.tab()
    expect(within(dialog()).getByLabelText(/^bank$/i)).toHaveFocus()
    // Native <select>: option chosen from the keyboard-focused control.
    await user.selectOptions(within(dialog()).getByLabelText(/^bank$/i), '058')
    await waitFor(() =>
      expect(within(dialog()).getByRole('button', { name: /^next$/i })).toBeEnabled(),
    )
    await user.tab()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: /how much/i })
    await waitFor(() => expect(screen.getByRole('heading', { name: /how much/i })).toHaveFocus())

    await user.tab()
    await user.keyboard('2500')
    await user.keyboard('{Enter}') // submits the form
    await screen.findByRole('dialog', { name: /review transfer/i })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /review transfer/i })).toHaveFocus(),
    )

    await user.tab() // heading → first "Edit recipient" link
    await user.tab()
    await user.tab()
    await user.tab()
    expect(within(dialog()).getByRole('button', { name: /continue/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: /confirm transfer/i })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /confirm transfer/i })).toHaveFocus(),
    )

    await user.tab()
    await user.tab()
    expect(confirmButton()).toHaveFocus()
    await user.keyboard('{Enter}')
    await within(dialog()).findByTestId('transfer-succeeded')
    expect(store.getState().sendMoney.submission?.status).toBe('succeeded')
  })

  it('success path: optimistic row and balance, then the server row and a receipt', async () => {
    const { user } = await renderApp()
    const before = availableBalance(getDb())
    await reachConfirm(user)
    setMockConfig({ latencyMs: [250, 250], clientTransferTimeoutMs: 5_000 }) // observable optimistic state

    await user.click(confirmButton())
    // Optimistic: balance down, pending row at the top marked "Sending…".
    await within(balanceRegion()).findByText(formatNaira(toKobo(before - AMOUNT)))
    expect(firstRow()).toHaveTextContent('Stock')
    expect(firstRow()).toHaveTextContent(/sending…/i)

    await within(dialog()).findByTestId('transfer-succeeded')
    // Reconciled: server row (Successful, real reference), balance from balanceAfter.
    await waitFor(() => expect(firstRow()).toHaveTextContent('Successful'))
    expect(firstRow()).toHaveTextContent('******4821')
    expect(
      within(balanceRegion()).getByText(formatNaira(toKobo(before - AMOUNT))),
    ).toBeInTheDocument()
    expect(screen.getByTestId('live-polite')).toHaveTextContent(
      `Sent ₦2,500.00 to ${RECIPIENT_NAME}.`,
    )

    await user.click(within(dialog()).getByRole('button', { name: /^done$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /send money/i })[0]).toHaveFocus(),
    )
    expect(getDb().transactions[0]?.idempotencyKey).toBeDefined()
  })

  it('definite failure: rolls back the balance and the feed and announces assertively', async () => {
    setMockConfig({ transferFailureRate: 1 })
    const { user } = await renderApp()
    const before = availableBalance(getDb())
    const originalFirstRowText = firstRow().textContent
    await reachConfirm(user)
    setMockConfig({ latencyMs: [250, 250], clientTransferTimeoutMs: 5_000 }) // observable optimistic state

    await user.click(confirmButton())
    await waitFor(() => expect(firstRow()).toHaveTextContent(/sending…/i))
    await within(balanceRegion()).findByText(formatNaira(toKobo(before - AMOUNT)))

    const failed = await within(dialog()).findByTestId('transfer-failed')
    expect(failed).toHaveTextContent(/simulated server error/i)
    await within(balanceRegion()).findByText(formatNaira(before))
    await waitFor(() => expect(firstRow().textContent).toBe(originalFirstRowText))
    expect(within(feedList()).queryByText(/sending…/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('live-assertive')).toHaveTextContent(
      /transfer failed: simulated server error/i,
    )
    expect(within(dialog()).getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('retry after failure reuses the same Idempotency-Key and succeeds once fixed', async () => {
    setMockConfig({ transferFailureRate: 1 })
    const { user } = await renderApp()
    const { posts, stop } = recordTransferRequests()
    await reachConfirm(user)
    await user.click(confirmButton())
    await within(dialog()).findByTestId('transfer-failed')

    setMockConfig({ transferFailureRate: 0 })
    await user.click(within(dialog()).getByRole('button', { name: /retry/i }))
    await within(dialog()).findByTestId('transfer-succeeded')

    expect(posts).toHaveLength(2)
    expect(posts[0]!.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(posts[1]!.key).toBe(posts[0]!.key)
    expect(getDb().transactions.filter((t) => t.idempotencyKey === posts[0]!.key)).toHaveLength(1)
    stop()
  })

  it('timeout → confirming → success (the debit had happened server-side)', async () => {
    setMockConfig({ transferTimeoutRate: 1, timeoutMode: 'committed', pollBaseMs: 300 })
    const { user } = await renderApp()
    const before = availableBalance(getDb())
    await reachConfirm(user)

    await user.click(confirmButton())
    const confirming = await within(dialog()).findByTestId('transfer-confirming')
    expect(confirming).toHaveTextContent(/don’t send it again/i)
    await waitFor(() => expect(firstRow()).toHaveTextContent(/confirming…/i))
    expect(screen.getByTestId('transfer-status-banner')).toHaveTextContent(
      /confirming your transfer/i,
    )
    // Nothing rolled back while unknown.
    await within(balanceRegion()).findByText(formatNaira(toKobo(before - AMOUNT)))

    await within(dialog()).findByTestId('transfer-succeeded')
    await waitFor(() => expect(firstRow()).toHaveTextContent('Successful'))
    expect(screen.queryByTestId('transfer-status-banner')).not.toBeInTheDocument()
    expect(availableBalance(getDb())).toBe(before - AMOUNT)
  })

  it('timeout → confirming → failed (the bank never received it): rollback, retry with the same key', async () => {
    setMockConfig({ transferTimeoutRate: 1, timeoutMode: 'dropped' })
    const { user } = await renderApp()
    const before = availableBalance(getDb())
    const { posts, stop } = recordTransferRequests()
    await reachConfirm(user)

    await user.click(confirmButton())
    await within(dialog()).findByTestId('transfer-confirming')

    const failed = await within(dialog()).findByTestId('transfer-failed')
    expect(failed).toHaveTextContent(/didn’t receive this transfer/i)
    await within(balanceRegion()).findByText(formatNaira(before))
    // The optimistic row itself must be gone, not merely re-badged.
    await waitFor(() => expect(within(feedList()).queryByText('Stock')).not.toBeInTheDocument())
    expect(availableBalance(getDb())).toBe(before)

    setMockConfig({ transferTimeoutRate: 0 })
    await user.click(within(dialog()).getByRole('button', { name: /retry/i }))
    await within(dialog()).findByTestId('transfer-succeeded')
    expect(posts.map((p) => p.key)).toEqual([posts[0]!.key, posts[0]!.key])
    expect(availableBalance(getDb())).toBe(before - AMOUNT)
    stop()
  })

  it('timeout → confirming → transfer later reported failed by the server', async () => {
    setMockConfig({ transferTimeoutRate: 1, timeoutMode: 'committed' })
    server.use(
      http.get('/api/transfers/:key', ({ params }) => {
        const record = getDb().idempotency.get(String(params.key))
        if (!record)
          return HttpResponse.json(
            { error: { code: 'TRANSFER_NOT_FOUND', message: 'x', requestId: 'r' } },
            { status: 404 },
          )
        return HttpResponse.json({
          ...record.transfer,
          status: 'failed',
          failureReason: 'Beneficiary bank unavailable',
        })
      }),
    )
    const { user } = await renderApp()
    const before = availableBalance(getDb())
    await reachConfirm(user)
    await user.click(confirmButton())
    await within(dialog()).findByTestId('transfer-confirming')
    const failed = await within(dialog()).findByTestId('transfer-failed')
    expect(failed).toHaveTextContent('Beneficiary bank unavailable')
    // Optimistic row rolled back; the balance is then re-fetched from the server (which, in this
    // synthetic scenario, had committed the debit) — the client shows server truth, not `before`.
    await waitFor(() => expect(within(feedList()).queryByText('Stock')).not.toBeInTheDocument())
    await within(balanceRegion()).findByText(formatNaira(availableBalance(getDb())))
    expect(before).toBeGreaterThan(availableBalance(getDb()))
  })

  it('a double-click sends exactly one request', async () => {
    const { user } = await renderApp()
    const { posts, stop } = recordTransferRequests()
    await reachConfirm(user)

    await user.dblClick(confirmButton())
    await within(dialog()).findByTestId('transfer-succeeded')
    expect(posts).toHaveLength(1)
    expect(getDb().transactions.filter((t) => t.idempotencyKey === posts[0]!.key)).toHaveLength(1)
    stop()
  })

  it('confirm is disabled while a submission is in flight', async () => {
    setMockConfig({
      transferTimeoutRate: 1,
      timeoutMode: 'committed',
      clientTransferTimeoutMs: 5_000,
    })
    const { user } = await renderApp()
    await reachConfirm(user)
    await user.click(confirmButton())
    expect(within(dialog()).getByRole('button', { name: /sending…/i })).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: /^back$/i })).toBeDisabled()
  })

  it('editing the amount generates a new key; going back and forth without changes keeps it', async () => {
    const { user, store } = await renderApp()
    await openSendMoney(user)
    await fillRecipient(user)
    await fillAmount(user, '2,500', 'Stock')
    const key1 = selectIdempotencyKey(store.getState())
    expect(key1).toMatch(/^[0-9a-f-]{36}$/)

    await user.click(within(dialog()).getByRole('button', { name: /^back$/i }))
    await screen.findByRole('dialog', { name: /how much/i })
    await user.click(within(dialog()).getByRole('button', { name: /^next$/i }))
    await screen.findByRole('dialog', { name: /review transfer/i })
    expect(selectIdempotencyKey(store.getState())).toBe(key1)

    await user.click(within(dialog()).getByRole('button', { name: /edit amount/i }))
    await fillAmount(user, '2,600')
    const key2 = selectIdempotencyKey(store.getState())
    expect(key2).not.toBe(key1)

    await user.click(within(dialog()).getByRole('button', { name: /edit amount/i }))
    await fillAmount(user, '2,600', 'Different narration')
    expect(selectIdempotencyKey(store.getState())).not.toBe(key2)
  })

  it('closing the dialog mid-confirmation keeps the banner and lock, and reopening shows the status', async () => {
    setMockConfig({ transferTimeoutRate: 1, timeoutMode: 'committed', pollBaseMs: 2_000 })
    const { user } = await renderApp()
    await reachConfirm(user)
    await user.click(confirmButton())
    await within(dialog()).findByTestId('transfer-confirming')

    await user.click(within(dialog()).getByRole('button', { name: /close and keep checking/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('transfer-status-banner')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /transfer in progress/i }).length).toBeGreaterThan(
      0,
    )

    await user.click(
      within(screen.getByTestId('transfer-status-banner')).getByRole('button', { name: /view/i }),
    )
    expect(
      await within(screen.getByRole('dialog')).findByTestId('transfer-confirming'),
    ).toBeInTheDocument()
  })

  it('has no axe violations on each step', async () => {
    const { user, baseElement } = await renderApp()
    await openSendMoney(user)
    expect(await runAxe(baseElement)).toHaveNoViolations()
    await fillRecipient(user)
    expect(await runAxe(baseElement)).toHaveNoViolations()
    await fillAmount(user, '2,500', 'Stock')
    expect(await runAxe(baseElement)).toHaveNoViolations()
    await continueToConfirm(user)
    expect(await runAxe(baseElement)).toHaveNoViolations()
  })
})

describe('Send Money while offline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows a clear message and blocks Confirm until back online', async () => {
    const { user } = await renderApp()
    await reachConfirm(user)

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(await within(dialog()).findByTestId('send-money-offline')).toHaveTextContent(
      /you’re offline/i,
    )
    expect(confirmButton()).toBeDisabled()
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/sending money is paused/i)

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(confirmButton()).toBeEnabled())
    expect(within(dialog()).queryByTestId('send-money-offline')).not.toBeInTheDocument()
  })
})
