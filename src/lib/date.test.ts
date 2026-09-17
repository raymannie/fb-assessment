import { describe, expect, it } from 'vitest'

import { lagosDateKey, lagosDayRange } from './date'

describe('lagosDateKey', () => {
  it.each([
    ['2026-09-17T12:00:00.000Z', '2026-09-17'],
    ['2026-09-17T23:30:00.000Z', '2026-09-18'], // 00:30 WAT next day
    ['2026-09-17T22:59:59.999Z', '2026-09-17'], // 23:59:59 WAT
    ['2026-12-31T23:00:00.000Z', '2027-01-01'],
  ])('%s → %s', (iso, expected) => {
    expect(lagosDateKey(new Date(iso))).toBe(expected)
  })
})

describe('lagosDayRange', () => {
  it('covers exactly one Lagos day in UTC', () => {
    const { start, end } = lagosDayRange('2026-09-17')
    expect(new Date(start).toISOString()).toBe('2026-09-16T23:00:00.000Z')
    expect(new Date(end).toISOString()).toBe('2026-09-17T23:00:00.000Z')
    expect(lagosDateKey(start)).toBe('2026-09-17')
    expect(lagosDateKey(end - 1)).toBe('2026-09-17')
    expect(lagosDateKey(end)).toBe('2026-09-18')
  })
})
