export interface BackoffOptions {
  baseMs: number
  factor: number
  maxMs: number
  /** 0–1 fraction of the delay to randomise either side, e.g. 0.2 = ±20 %. */
  jitter: number
  /** Injectable for deterministic tests. */
  random?: () => number
}

/** Exponential backoff with symmetric jitter: min(max, base·factor^attempt) ± jitter. */
export function backoffDelayMs(attempt: number, options: BackoffOptions): number {
  const raw = Math.min(options.maxMs, options.baseMs * options.factor ** Math.max(0, attempt))
  const spread = raw * options.jitter
  const r = (options.random ?? Math.random)()
  return Math.max(0, Math.round(raw - spread + r * 2 * spread))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
