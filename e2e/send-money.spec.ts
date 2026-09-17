import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

import { gotoApp, useMockConfig } from './fixtures/mockConfig'

const ACCOUNT = '0123454821'
const BANK = '058' // Guaranty Trust Bank
const AMOUNT_TEXT = '2,500'
const AMOUNT_NAIRA = '₦2,500.00'

const dialog = (page: Page) => page.getByRole('dialog')
const balanceCard = (page: Page) => page.getByTestId('balance-card')
// includeHidden: while the dialog is open Radix marks the page behind it aria-hidden.
const feedRows = (page: Page) =>
  page.getByTestId('transaction-list').getByRole('listitem', { includeHidden: true })

/** Reads the big "available" figure, e.g. "₦2,224,296.25". */
async function readAvailable(page: Page): Promise<string> {
  const text = await balanceCard(page).locator('p.text-3xl').innerText()
  return text.trim()
}

function nairaToKobo(text: string): number {
  const [whole = '0', frac = '00'] = text.replace(/[^\d.]/g, '').split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** Recipient → amount → review → confirm, stopping on the Confirm step. */
async function reachConfirm(page: Page, amount = AMOUNT_TEXT, narration = 'Stock') {
  await page
    .getByRole('button', { name: /send money/i })
    .first()
    .click()
  await expect(dialog(page)).toContainText(/who are you sending to/i)
  await dialog(page)
    .getByLabel(/account number/i)
    .fill(ACCOUNT)
  await dialog(page)
    .getByLabel(/^bank$/i)
    .selectOption(BANK)
  await expect(dialog(page).getByRole('status')).toContainText(/[A-Z]+ [A-Z]+/)
  await dialog(page)
    .getByRole('button', { name: /^next$/i })
    .click()

  await expect(dialog(page)).toContainText(/how much/i)
  await dialog(page)
    .getByLabel(/amount/i)
    .fill(amount)
  await dialog(page)
    .getByLabel(/narration/i)
    .fill(narration)
  await dialog(page)
    .getByRole('button', { name: /^next$/i })
    .click()

  await expect(dialog(page)).toContainText(/review transfer/i)
  await expect(dialog(page)).toContainText(AMOUNT_NAIRA)
  await dialog(page)
    .getByRole('button', { name: /continue/i })
    .click()
  await expect(dialog(page)).toContainText(/confirm transfer/i)
}

test.describe('Send Money', () => {
  test('happy path: optimistic update, receipt, server row and balance reconcile', async ({
    page,
  }) => {
    await useMockConfig(page, { latencyMs: [300, 300] })
    await gotoApp(page)
    const before = await readAvailable(page)
    await reachConfirm(page)

    await dialog(page)
      .getByRole('button', { name: /confirm and send/i })
      .click()
    // Optimistic state is visible during the 300ms mock latency.
    await expect(feedRows(page).first()).toContainText(/sending…/i)
    await expect(balanceCard(page)).toContainText(
      new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
        (nairaToKobo(before) - 250_000) / 100,
      ),
    )
    await expect(dialog(page).getByTestId('transfer-succeeded')).toBeVisible()
    await expect(feedRows(page).first()).toContainText('Successful')
    await expect(feedRows(page).first()).toContainText('Stock')
    await expect(feedRows(page).first()).toContainText('******4821')
    await dialog(page)
      .getByRole('button', { name: /^done$/i })
      .click()
    await expect(dialog(page)).toBeHidden()
    expect(nairaToKobo(await readAvailable(page))).toBe(nairaToKobo(before) - 250_000)
  })

  test('forced failure: rollback of balance and feed, then retry with the same key succeeds', async ({
    page,
  }) => {
    await useMockConfig(page, { transferFailureRate: 1 })
    await gotoApp(page)
    const before = await readAvailable(page)
    const firstRowBefore = await feedRows(page).first().innerText()
    const keys: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/api/transfers'))
        keys.push(req.headers()['idempotency-key'] ?? '')
    })
    await reachConfirm(page)

    await dialog(page)
      .getByRole('button', { name: /confirm and send/i })
      .click()
    const failed = dialog(page).getByTestId('transfer-failed')
    await expect(failed).toContainText(/simulated server error/i)
    await expect(failed).toContainText(/nothing was debited/i)
    await expect.poll(() => readAvailable(page)).toBe(before)
    await expect.poll(() => feedRows(page).first().innerText()).toBe(firstRowBefore)
    await expect(page.getByTestId('live-assertive')).toContainText(/transfer failed/i)

    // Flip the fault off through the dev panel (close the dialog first: the page behind a modal
    // is inert), then reopen — the failed state is kept in the store — and Retry.
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await page.getByRole('button', { name: /mock api settings/i }).click()
    await page.getByLabel(/transfer failure rate/i).fill('0')
    await page.keyboard.press('Escape')
    await page
      .getByRole('button', { name: /send money/i })
      .first()
      .click()
    await expect(dialog(page).getByTestId('transfer-failed')).toBeVisible()
    await dialog(page).getByRole('button', { name: /retry/i }).click()
    await expect(dialog(page).getByTestId('transfer-succeeded')).toBeVisible()

    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(nairaToKobo(await readAvailable(page))).toBe(nairaToKobo(before) - 250_000)
  })

  test('forced timeout: confirming state, banner, then reconciled to success without a second debit', async ({
    page,
  }) => {
    await useMockConfig(page, {
      transferTimeoutRate: 1,
      timeoutMode: 'committed',
      clientTransferTimeoutMs: 500,
      pollBaseMs: 2000, // confirming state stays observable for ~2s before the first poll
    })
    await gotoApp(page)
    const before = await readAvailable(page)
    await reachConfirm(page)

    await dialog(page)
      .getByRole('button', { name: /confirm and send/i })
      .click()
    await expect(dialog(page).getByRole('button', { name: /sending…/i })).toBeDisabled()
    await expect(dialog(page).getByTestId('transfer-confirming')).toBeVisible()
    await expect(page.getByTestId('transfer-status-banner')).toContainText(/don’t send it again/i)
    await expect(feedRows(page).first()).toContainText(/confirming…/i)

    await expect(dialog(page).getByTestId('transfer-succeeded')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('transfer-status-banner')).toBeHidden()
    await expect(feedRows(page).first()).toContainText('Successful')
    expect(nairaToKobo(await readAvailable(page))).toBe(nairaToKobo(before) - 250_000)
    // Exactly one debit row for this transfer.
    await expect(feedRows(page).filter({ hasText: 'Stock' })).toHaveCount(1)
  })

  test('forced timeout, request dropped: rollback and safe retry', async ({ page }) => {
    await useMockConfig(page, {
      transferTimeoutRate: 1,
      timeoutMode: 'dropped',
      clientTransferTimeoutMs: 500,
      pollBaseMs: 1500, // long enough for the confirming state to be observable
    })
    await gotoApp(page)
    const before = await readAvailable(page)
    await reachConfirm(page)
    await dialog(page)
      .getByRole('button', { name: /confirm and send/i })
      .click()
    await expect(dialog(page).getByTestId('transfer-confirming')).toBeVisible()
    const failed = dialog(page).getByTestId('transfer-failed')
    await expect(failed).toContainText(/didn’t receive this transfer/i, { timeout: 10_000 })
    await expect.poll(() => readAvailable(page)).toBe(before)
    // The optimistic row itself must be gone, not merely re-badged.
    await expect(feedRows(page).first()).not.toContainText('Stock')
  })

  test('keyboard-only flow', async ({ page }) => {
    await useMockConfig(page)
    await gotoApp(page)
    const before = await readAvailable(page)

    // Tab until the Send money CTA has focus: 2nd stop on desktop (after the skip link); on
    // mobile the header CTA is hidden and the bottom-bar CTA comes after the filter controls.
    const onCta = () =>
      page.evaluate(() => {
        const el = document.activeElement
        return el?.tagName === 'BUTTON' && el.textContent?.trim() === 'Send money'
      })
    let guard = 0
    while (!(await onCta()) && guard++ < 40) await page.keyboard.press('Tab')
    expect(await onCta()).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: /who are you sending to/i })).toBeFocused()

    await page.keyboard.press('Tab')
    await expect(dialog(page).getByLabel(/account number/i)).toBeFocused()
    await page.keyboard.type(ACCOUNT)
    await page.keyboard.press('Tab')
    await expect(dialog(page).getByLabel(/^bank$/i)).toBeFocused()
    await page.keyboard.type('Guaranty') // native <select> type-ahead
    await expect(dialog(page).getByLabel(/^bank$/i)).toHaveValue(BANK)
    await expect(dialog(page).getByRole('button', { name: /^next$/i })).toBeEnabled()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: /how much/i })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.type('2500')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: /review transfer/i })).toBeFocused()
    await dialog(page)
      .getByRole('button', { name: /continue/i })
      .focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: /confirm transfer/i })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(dialog(page).getByRole('button', { name: /confirm and send/i })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog(page).getByTestId('transfer-succeeded')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    expect(nairaToKobo(await readAvailable(page))).toBe(nairaToKobo(before) - 250_000)
  })

  test('is accessible at every step', async ({ page }) => {
    await useMockConfig(page)
    await gotoApp(page)
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(results.violations).toEqual([])
    }
    await page
      .getByRole('button', { name: /send money/i })
      .first()
      .click()
    await expect(dialog(page)).toContainText(/who are you sending to/i)
    await scan()
    await dialog(page)
      .getByLabel(/account number/i)
      .fill(ACCOUNT)
    await dialog(page)
      .getByLabel(/^bank$/i)
      .selectOption(BANK)
    await dialog(page)
      .getByRole('button', { name: /^next$/i })
      .click()
    await expect(dialog(page)).toContainText(/how much/i)
    await scan()
    await dialog(page)
      .getByLabel(/amount/i)
      .fill(AMOUNT_TEXT)
    await dialog(page)
      .getByRole('button', { name: /^next$/i })
      .click()
    await expect(dialog(page)).toContainText(/review transfer/i)
    await scan()
    await dialog(page)
      .getByRole('button', { name: /continue/i })
      .click()
    await expect(dialog(page)).toContainText(/confirm transfer/i)
    await scan()
  })
})
