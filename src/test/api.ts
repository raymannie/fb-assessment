import { resetDb } from '@/mocks/db'

/** Fixed clock for deterministic "today" totals and seed data in handler tests. */
export const TEST_NOW = Date.parse('2026-09-17T10:00:00.000Z')
export const TEST_SEED = 42

/** Seeds the db relative to TEST_NOW. Pair with `vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })`. */
export function seedTestDb(options: { seed?: number; now?: number } = {}) {
  return resetDb({ seed: options.seed ?? TEST_SEED, now: options.now ?? TEST_NOW })
}

export interface ApiResult<T = unknown> {
  status: number
  headers: Headers
  body: T
}

/** fetch against the MSW node server. jsdom gives relative URLs an origin; Node's fetch needs an absolute one. */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(new URL(path, window.location.origin), init)
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    body: (text ? JSON.parse(text) : null) as T,
  }
}

export function postJson<T = unknown>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return api<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
