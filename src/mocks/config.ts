/**
 * Runtime behaviour of the mock API. Defaults come from VITE_MOCK_* env vars; the dev
 * settings panel and e2e tests override them at runtime, persisted in sessionStorage
 * (never localStorage — only the theme lives there).
 *
 * Handlers run in the page (MSW's service worker only proxies), so a module singleton
 * is visible to both the panel and the handlers.
 */
export type TimeoutMode = 'committed' | 'dropped'

export interface MockConfig {
  /** Random delay applied to every handled request. */
  latencyMs: readonly [min: number, max: number]
  /** 0–1. Probability that a read (balance, transactions, name enquiry) returns 500. */
  failureRate: number
  /** 0–1. Probability that POST /transfers returns a 500 *with* an error body (definite failure). */
  transferFailureRate: number
  /** 0–1. Probability that POST /transfers never responds → client sees an unknown outcome. */
  transferTimeoutRate: number
  /**
   * committed: the debit happens before the response is withheld (GET /transfers/:key finds it).
   * dropped:   the request "never arrived" (GET /transfers/:key → 404).
   */
  timeoutMode: TimeoutMode
  /**
   * Client-side knobs, kept here because this is the one runtime-settings channel shared by the
   * dev panel and Playwright. Not mock-server behaviour.
   */
  /** How long the client waits for POST /transfers before treating the outcome as unknown. */
  clientTransferTimeoutMs: number
  /** Base delay of the status-poll backoff (1s → 2s → 4s → 8s cap). */
  pollBaseMs: number
}

export const MOCK_CONFIG_STORAGE_KEY = 'novabiz.mock-config'

const isTestRun = import.meta.env.MODE === 'test'

function toNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback
  const n = value === '' ? Number.NaN : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function defaultMockConfig(): MockConfig {
  const min = isTestRun ? 0 : toNumber(import.meta.env.VITE_MOCK_LATENCY_MIN_MS, 200)
  const max = isTestRun ? 0 : toNumber(import.meta.env.VITE_MOCK_LATENCY_MAX_MS, 800)
  const mode = import.meta.env.VITE_MOCK_TIMEOUT_MODE
  return {
    latencyMs: [Math.max(0, min), Math.max(min, max)],
    failureRate: clamp01(toNumber(import.meta.env.VITE_MOCK_FAILURE_RATE, 0)),
    transferFailureRate: 0,
    transferTimeoutRate: clamp01(toNumber(import.meta.env.VITE_MOCK_TRANSFER_TIMEOUT_RATE, 0)),
    timeoutMode: mode === 'dropped' ? 'dropped' : 'committed',
    clientTransferTimeoutMs: toNumber(import.meta.env.VITE_TRANSFER_TIMEOUT_MS, 10_000),
    pollBaseMs: toNumber(import.meta.env.VITE_TRANSFER_POLL_BASE_MS, 1_000),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Merges an untrusted partial (storage, panel) onto a base config, coercing and clamping. */
export function sanitizeMockConfig(base: MockConfig, patch: unknown): MockConfig {
  if (!isRecord(patch)) return base
  const next: MockConfig = { ...base }

  if (Array.isArray(patch.latencyMs) && patch.latencyMs.length === 2) {
    const min = Math.max(0, toNumber(patch.latencyMs[0], base.latencyMs[0]))
    const max = Math.max(min, toNumber(patch.latencyMs[1], base.latencyMs[1]))
    next.latencyMs = [min, max]
  }
  for (const key of ['failureRate', 'transferFailureRate', 'transferTimeoutRate'] as const) {
    const value = patch[key]
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = clamp01(value)
  }
  if (patch.timeoutMode === 'committed' || patch.timeoutMode === 'dropped') {
    next.timeoutMode = patch.timeoutMode
  }
  for (const key of ['clientTransferTimeoutMs', 'pollBaseMs'] as const) {
    const value = patch[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      next[key] = Math.round(value)
  }
  return next
}

function readStored(): unknown {
  try {
    const raw = globalThis.sessionStorage?.getItem(MOCK_CONFIG_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as unknown) : undefined
  } catch {
    return undefined
  }
}

function writeStored(config: MockConfig | null): void {
  try {
    if (config) globalThis.sessionStorage?.setItem(MOCK_CONFIG_STORAGE_KEY, JSON.stringify(config))
    else globalThis.sessionStorage?.removeItem(MOCK_CONFIG_STORAGE_KEY)
  } catch {
    /* storage unavailable */
  }
}

let current: MockConfig = sanitizeMockConfig(defaultMockConfig(), readStored())
const listeners = new Set<() => void>()

export function getMockConfig(): MockConfig {
  return current
}

export function setMockConfig(patch: Partial<MockConfig>): MockConfig {
  current = sanitizeMockConfig(current, patch)
  writeStored(current)
  listeners.forEach((l) => l())
  return current
}

/** Back to env defaults and clears the stored override. */
export function resetMockConfig(): MockConfig {
  current = defaultMockConfig()
  writeStored(null)
  listeners.forEach((l) => l())
  return current
}

export function subscribeMockConfig(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
