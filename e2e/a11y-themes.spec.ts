import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

import { gotoApp, useMockConfig } from './fixtures/mockConfig'

const THEMES = ['light', 'dark'] as const
const WIDTHS = [360, 768, 1440] as const

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    // Notification region belongs to sonner; everything else is ours.
    .exclude('[aria-label="Notifications alt+T"]')
    .analyze()
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary?.split('\n')[1] })),
  }))
  expect(summary, label).toEqual([])
}

async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => localStorage.setItem('novabiz.theme', t), theme)
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`${theme} theme at ${width}px: dashboard, dialog steps, errors and banners pass AA contrast`, async ({
      page,
    }) => {
      test.skip(
        (width === 360) !== (page.viewportSize()?.width === 360),
        'Each width runs once: 360 on the mobile project, others on desktop',
      )
      await page.setViewportSize({ width, height: width === 360 ? 740 : 900 })
      await useTheme(page, theme)
      await useMockConfig(page, {
        transferTimeoutRate: 1,
        timeoutMode: 'committed',
        clientTransferTimeoutMs: 300,
        pollBaseMs: 30_000,
      })
      await gotoApp(page)
      await expect(page.getByTestId('transaction-list').getByRole('listitem').first()).toBeVisible()
      await scan(page, 'dashboard')

      // Offline banner (real network condition, not a mocked flag).
      await page.context().setOffline(true)
      await expect(page.getByTestId('offline-banner')).toContainText(/you’re offline/i)
      await scan(page, 'offline banner')
      await page.context().setOffline(false)
      await expect(page.getByTestId('offline-banner')).toBeEmpty()

      const dialog = page.getByRole('dialog')
      await page
        .getByRole('button', { name: /send money/i })
        .first()
        .click()
      await expect(dialog).toContainText(/who are you sending to/i)
      await dialog.getByLabel(/account number/i).fill('123')
      await dialog.getByLabel(/account number/i).blur()
      await expect(dialog.getByText(/enter the 10-digit account number/i)).toBeVisible()
      await scan(page, 'recipient step with validation error')

      await dialog.getByLabel(/account number/i).fill('0123454820') // ends in 0 → not found
      await dialog.getByLabel(/^bank$/i).selectOption('058')
      await expect(dialog.getByRole('alert')).toContainText(/no account found/i)
      await scan(page, 'recipient not found')

      await dialog.getByLabel(/account number/i).fill('0123454821')
      await expect(dialog.getByRole('status')).toContainText(/[A-Z]+ [A-Z]+/)
      await dialog.getByRole('button', { name: /^next$/i }).click()
      await dialog.getByLabel(/amount/i).fill('2500')
      await dialog.getByRole('button', { name: /^next$/i }).click()
      await expect(dialog).toContainText(/review transfer/i)
      await scan(page, 'review step')
      await dialog.getByRole('button', { name: /continue/i }).click()

      // Confirming state: amber banner + row badge + in-dialog panel.
      await dialog.getByRole('button', { name: /confirm and send/i }).click()
      await expect(dialog.getByTestId('transfer-confirming')).toBeVisible()
      await expect(page.getByTestId('transfer-status-banner')).toBeVisible()
      await scan(page, 'confirming state')
    })
  }
}
