import { describe, expect, it } from 'vitest'

import { addKobo, isKobo, type Kobo, subtractKobo, toKobo, ZERO_KOBO } from './kobo'

describe('isKobo', () => {
  it.each([
    [0, true],
    [1, true],
    [99, true],
    [100, true],
    [100050, true],
    [-1, true],
    [-100050, true],
    [Number.MAX_SAFE_INTEGER, true],
    [-Number.MAX_SAFE_INTEGER, true],
    [Number.MAX_SAFE_INTEGER + 1, false],
    [1.5, false],
    [19.99 * 100, false], // 1998.9999999999998 — the classic float trap
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
    ['100', false],
    [null, false],
    [undefined, false],
    [100n, false],
  ])('isKobo(%p) → %s', (value, expected) => {
    expect(isKobo(value)).toBe(expected)
  })
})

describe('toKobo', () => {
  it.each([0, 1, 99, 100, 100050, -5, Number.MAX_SAFE_INTEGER])('accepts safe integer %p', (n) => {
    const k: Kobo = toKobo(n)
    expect(k).toBe(n)
  })

  it.each([1.5, 1998.9999999999998, Number.NaN, Number.MAX_SAFE_INTEGER + 1, -0.5])(
    'rejects %p',
    (n) => {
      expect(() => toKobo(n)).toThrow(TypeError)
    },
  )

  it('normalises -0 to 0', () => {
    expect(Object.is(toKobo(-0), 0)).toBe(true)
  })
})

describe('addKobo / subtractKobo', () => {
  it('adds and subtracts with integer math', () => {
    expect(addKobo(toKobo(100050), toKobo(50))).toBe(100100)
    expect(subtractKobo(toKobo(100050), toKobo(100050))).toBe(0)
    expect(subtractKobo(ZERO_KOBO, toKobo(1))).toBe(-1)
  })

  it('throws instead of silently losing precision past MAX_SAFE_INTEGER', () => {
    expect(() => addKobo(toKobo(Number.MAX_SAFE_INTEGER), toKobo(1))).toThrow(RangeError)
    expect(() => subtractKobo(toKobo(-Number.MAX_SAFE_INTEGER), toKobo(1))).toThrow(RangeError)
  })
})
