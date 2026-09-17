import { expect, test } from '@playwright/test'

import { gotoApp, useMockConfig } from './fixtures/mockConfig'

test.describe('mock API in the browser', () => {
  test('serves seeded data through the worker', async ({ page }) => {
    await useMockConfig(page)
    await gotoApp(page)
    const balance = await page.evaluate(() => fetch('/api/balance').then((r) => r.json()))
    expect(balance).toMatchObject({ currency: 'NGN', today: { timezone: 'Africa/Lagos' } })
    const feed = await page.evaluate(() =>
      fetch('/api/transactions?limit=5').then(
        (r) => r.json() as Promise<{ items: unknown[]; nextCursor: string }>,
      ),
    )
    expect(feed.items).toHaveLength(5)
    expect(feed.nextCursor).toEqual(expect.any(String))
  })

  test('config seeded by the test drives failures deterministically', async ({ page }) => {
    await useMockConfig(page, { failureRate: 1 })
    await gotoApp(page)
    const status = await page.evaluate(() => fetch('/api/balance').then((r) => r.status))
    expect(status).toBe(500)
  })

  test('dev settings panel changes behaviour at runtime and persists per tab', async ({ page }) => {
    await useMockConfig(page)
    await gotoApp(page)
    await page.getByRole('button', { name: /mock api settings/i }).click()
    const field = page.getByLabel(/read failure rate/i)
    await field.fill('100')
    await page.keyboard.press('Escape')

    expect(await page.evaluate(() => fetch('/api/balance').then((r) => r.status))).toBe(500)
    await page.reload()
    await page.getByRole('banner').waitFor()
    expect(await page.evaluate(() => fetch('/api/balance').then((r) => r.status))).toBe(500)
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
  })
})
