import { describe, expect, it } from 'vitest'

import {
  defaultMockConfig,
  getMockConfig,
  MOCK_CONFIG_STORAGE_KEY,
  resetMockConfig,
  sanitizeMockConfig,
  setMockConfig,
  subscribeMockConfig,
} from './config'

describe('mock config', () => {
  it('has zero latency and no faults under test', () => {
    expect(defaultMockConfig()).toEqual({
      latencyMs: [0, 0],
      failureRate: 0,
      transferFailureRate: 0,
      transferTimeoutRate: 0,
      timeoutMode: 'committed',
      clientTransferTimeoutMs: 10_000,
      pollBaseMs: 1_000,
    })
  })

  it('clamps and coerces untrusted patches', () => {
    const base = defaultMockConfig()
    expect(sanitizeMockConfig(base, { failureRate: 7, transferTimeoutRate: -1 })).toMatchObject({
      failureRate: 1,
      transferTimeoutRate: 0,
    })
    expect(sanitizeMockConfig(base, { latencyMs: ['300', '100'] }).latencyMs).toEqual([300, 300])
    expect(sanitizeMockConfig(base, { latencyMs: [-5, 'x'] }).latencyMs).toEqual([0, 0])
    expect(sanitizeMockConfig(base, { timeoutMode: 'explode' }).timeoutMode).toBe('committed')
    expect(sanitizeMockConfig(base, { timeoutMode: 'dropped' }).timeoutMode).toBe('dropped')
    expect(sanitizeMockConfig(base, 'garbage')).toBe(base)
    expect(sanitizeMockConfig(base, { failureRate: Number.NaN })).toEqual(base)
  })

  it('persists to sessionStorage, notifies subscribers, and resets', () => {
    const seen: number[] = []
    const unsubscribe = subscribeMockConfig(() => seen.push(getMockConfig().failureRate))

    setMockConfig({ failureRate: 0.5 })
    expect(getMockConfig().failureRate).toBe(0.5)
    expect(JSON.parse(sessionStorage.getItem(MOCK_CONFIG_STORAGE_KEY)!)).toMatchObject({
      failureRate: 0.5,
    })
    expect(localStorage.length).toBe(0)

    resetMockConfig()
    expect(getMockConfig().failureRate).toBe(0)
    expect(sessionStorage.getItem(MOCK_CONFIG_STORAGE_KEY)).toBeNull()
    expect(seen).toEqual([0.5, 0])
    unsubscribe()
  })
})
