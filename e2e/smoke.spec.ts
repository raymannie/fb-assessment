import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { gotoApp, useMockConfig } from './fixtures/mockConfig'

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await useMockConfig(page)
  })

  test('boots with the mock API intercepting requests', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('heading', { name: /available balance/i })).toBeVisible()

    // Proves MSW started before first render: a fetch from the page hits the worker, not the network.
    const health = await page.evaluate(() => fetch('/api/health').then((r) => r.json()))
    expect(health).toEqual({ ok: true, mock: true })
  })

  test('send money CTA opens the lazy-loaded dialog', async ({ page }) => {
    await gotoApp(page)
    await page
      .getByRole('button', { name: /send money/i })
      .first()
      .click()
    await expect(page.getByRole('dialog', { name: /who are you sending to/i })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('dark mode toggle persists across reload', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: /switch to dark theme/i }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['novabiz.theme'])
  })

  test('has no serious accessibility violations', async ({ page }) => {
    await gotoApp(page)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
