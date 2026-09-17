/**
 * Typed access to Vite env vars with safe defaults.
 * Everything here is public (bundled into the client) — never put secrets in VITE_* vars.
 */
function readInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number.parseInt(value, 10)
  return Number.isSafeInteger(n) && n > 0 ? n : fallback
}

export const env = {
  /** MSW is on unless explicitly disabled — there is no real backend. */
  mswEnabled: import.meta.env.VITE_ENABLE_MSW !== 'false',
  /** Default timeout for GET requests (ms). */
  requestTimeoutMs: readInt(import.meta.env.VITE_REQUEST_TIMEOUT_MS, 10_000),
  /** Timeout for POST /transfers (ms). Exceeding it means "unknown outcome", not failure. */
  transferTimeoutMs: readInt(import.meta.env.VITE_TRANSFER_TIMEOUT_MS, 10_000),
  /** Base delay for retrying GETs after a network error (doubles per attempt). */
  getRetryBaseMs: readInt(import.meta.env.VITE_GET_RETRY_BASE_MS, 500),
  isDev: import.meta.env.DEV,
  /** Floating mock-API settings panel: always in dev, opt-in for a hosted demo build. */
  mockPanelEnabled: import.meta.env.DEV || import.meta.env.VITE_MOCK_PANEL === 'true',
} as const
