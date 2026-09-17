import { describe, expect, it } from 'vitest'

import { maskAccountNumber } from './mask'

describe('maskAccountNumber', () => {
  it.each([
    ['0123454821', '******4821'],
    ['0123 454 821', '******4821'],
    ['4821', '****'],
    ['21', '**'],
    ['', ''],
  ])('%p → %p', (input, expected) => {
    expect(maskAccountNumber(input)).toBe(expected)
  })
})
