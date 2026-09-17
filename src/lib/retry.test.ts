import { describe, expect, it } from 'vitest'

import { backoffDelayMs } from './retry'

const base = { baseMs: 1000, factor: 2, maxMs: 8000, jitter: 0.2 }

describe('backoffDelayMs', () => {
  it('doubles up to the cap with no jitter at random=0.5', () => {
    const delays = [0, 1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, { ...base, random: () => 0.5 }))
    expect(delays).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
  })

  it('jitters ±20% at the extremes and never goes negative', () => {
    expect(backoffDelayMs(0, { ...base, random: () => 0 })).toBe(800)
    expect(backoffDelayMs(0, { ...base, random: () => 1 })).toBe(1200)
    expect(backoffDelayMs(3, { ...base, random: () => 1 })).toBe(9600)
    expect(backoffDelayMs(0, { ...base, jitter: 1, random: () => 0 })).toBe(0)
  })

  it('treats negative attempts as the first', () => {
    expect(backoffDelayMs(-3, { ...base, random: () => 0.5 })).toBe(1000)
  })
})
