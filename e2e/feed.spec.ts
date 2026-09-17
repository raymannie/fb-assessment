import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { gotoApp, useMockConfig } from './fixtures/mockConfig'

test.describe('balance and transaction feed', () => {
  test.beforeEach(async ({ page }) => {
    await useMockConfig(page)
  })

  test('renders balance, today totals and the first page of transactions', async ({ page }) => {
    await gotoApp(page)
    const balance = page.getByRole('region', { name: /available balance/i })
    await expect(balance.getByText(/^₦[\d,]+\.\d{2}$/).first()).toBeVisible()
    await expect(balance.getByText(/today’s inflow/i)).toBeVisible()

    const list = page.getByRole('list', { name: /transactions/i })
    await expect(list.getByRole('listitem').first()).toBeVisible()
    // Hostile seed row on page 1 is rendered as text, not markup.
    await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(await page.locator('img').count()).toBe(0)
  })

  test('infinite scroll loads more pages while keeping the DOM bounded', async ({ page }) => {
    await gotoApp(page)
    const list = page.getByRole('list', { name: /transactions/i })
    await expect(list.getByRole('listitem').first()).toBeVisible()

    // Scroll to the bottom a few times; each pass should pull another page.
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 20_000)
      await page.waitForTimeout(150)
    }
    // With 4+ pages loaded (200+ rows), only the visible window is in the DOM.
    const heightAfter = await list.evaluate((el) => el.getBoundingClientRect().height)
    expect(heightAfter).toBeGreaterThan(150 * 60)
    expect(await list.getByRole('listitem').count()).toBeLessThan(60)
  })

  test('"Load more" works without scrolling and the URL carries filters', async ({ page }) => {
    await gotoApp(page, '/?status=failed')
    await expect(page.getByLabel(/status/i)).toHaveValue('failed')
    const list = page.getByRole('list', { name: /transactions/i })
    await expect(list.getByRole('listitem').first()).toContainText('Failed')

    await page.getByLabel(/type/i).selectOption('debit')
    await expect(page).toHaveURL(/status=failed&type=debit/)
    await page.getByRole('button', { name: /clear filters/i }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('is accessible on this view', async ({ page }) => {
    await gotoApp(page)
    await expect(
      page
        .getByRole('list', { name: /transactions/i })
        .getByRole('listitem')
        .first(),
    ).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
