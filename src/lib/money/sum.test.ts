import { describe, expect, it } from 'vitest'

import { toKobo } from './kobo'
import { sumKobo } from './sum'

const k = (n: number) => toKobo(n)

describe('sumKobo', () => {
  it.each([
    [[], 0],
    [[0], 0],
    [[1], 1],
    [[99, 1], 100],
    [[100050, 100050], 200100],
    [[100050, -100050], 0],
    [[-1, -99], -100],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 55],
    [[Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER], 0],
  ])('sum(%j) = %d', (values, expected) => {
    expect(sumKobo(values.map(k))).toBe(expected)
  })

  it('accepts any iterable', () => {
    expect(sumKobo(new Set([k(1), k(2)]))).toBe(3)
    expect(
      sumKobo(
        (function* () {
          yield k(5)
          yield k(5)
        })(),
      ),
    ).toBe(10)
  })

  it('throws instead of returning an imprecise total', () => {
    expect(() => sumKobo([k(Number.MAX_SAFE_INTEGER), k(1)])).toThrow(RangeError)
  })

  it('is stable over 1,500 rows (the seed size)', () => {
    const rows = Array.from({ length: 1500 }, (_, i) => k((i % 7) * 12345 - 30000))
    const expected = rows.reduce<number>((acc, v) => acc + v, 0)
    expect(sumKobo(rows)).toBe(expected)
  })
})
