import type { Page } from '@playwright/test'

/** Mirrors src/mocks/config.ts (kept in sync by the "persists" smoke test). */
export interface MockConfigPatch {
  latencyMs?: [number, number]
  failureRate?: number
  transferFailureRate?: number
  transferTimeoutRate?: number
  timeoutMode?: 'committed' | 'dropped'
  clientTransferTimeoutMs?: number
  pollBaseMs?: number
}

const STORAGE_KEY = 'novabiz.mock-config'

/**
 * Seeds the mock config into sessionStorage before any page script runs, so the very
 * first request already sees it. Defaults to zero latency for fast, deterministic runs.
 */
export async function useMockConfig(page: Page, patch: MockConfigPatch = {}): Promise<void> {
  const config: MockConfigPatch = { latencyMs: [0, 0], ...patch }
  // Init scripts re-run on every navigation (including reload); seed once per tab so that
  // changes made through the dev panel survive a reload exactly as they do for a user.
  await page.addInitScript(
    ([key, value]) => {
      const marker = `${key}.seeded`
      if (sessionStorage.getItem(marker)) return
      sessionStorage.setItem(marker, '1')
      sessionStorage.setItem(key, value)
    },
    [STORAGE_KEY, JSON.stringify(config)] as const,
  )
}

/**
 * Navigates and waits for the app shell. main.tsx renders only after `worker.start()` resolves,
 * so once the header is visible every fetch from the page is guaranteed to hit the mock.
 */
export async function gotoApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  // Not getByRole: a deep link may open a modal immediately, which marks the header aria-hidden.
  await page.locator('header').first().waitFor()
}
