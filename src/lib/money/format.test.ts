import { describe, expect, it, vi } from 'vitest'

import { formatNaira, koboToDecimalString } from './format'
import { toKobo } from './kobo'

describe('runtime ICU preflight', () => {
  // If this fails, Node was built with small-icu (or the en-NG locale is missing):
  // output would be "NGN 1,000.50" with a non-breaking space instead of "₦1,000.50".
  it('has full ICU data for en-NG', () => {
    expect(Intl.NumberFormat.supportedLocalesOf(['en-NG'])).toEqual(['en-NG'])
    const sample = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(1)
    expect(sample, 'Run tests with a full-icu Node (Node ≥ 13 default)').toBe('₦1.00')
  })
})

describe('koboToDecimalString', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [9, '0.09'],
    [10, '0.10'],
    [99, '0.99'],
    [100, '1.00'],
    [101, '1.01'],
    [100050, '1000.50'],
    [-1, '-0.01'],
    [-100050, '-1000.50'],
    [123456789, '1234567.89'],
    [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
    [-Number.MAX_SAFE_INTEGER, '-90071992547409.91'],
  ])('%d → %p', (kobo, expected) => {
    expect(koboToDecimalString(toKobo(kobo))).toBe(expected)
  })
})

describe('formatNaira', () => {
  it.each([
    [0, '₦0.00'],
    [1, '₦0.01'],
    [99, '₦0.99'],
    [100, '₦1.00'],
    [1999, '₦19.99'],
    [100050, '₦1,000.50'],
    [123456789, '₦1,234,567.89'],
    [-1, '-₦0.01'],
    [-100050, '-₦1,000.50'],
    [Number.MAX_SAFE_INTEGER, '₦90,071,992,547,409.91'],
    [-Number.MAX_SAFE_INTEGER, '-₦90,071,992,547,409.91'],
  ])('%d kobo → %p', (kobo, expected) => {
    expect(formatNaira(toKobo(kobo))).toBe(expected)
  })

  it('keeps every digit exact for large values (no float rounding)', () => {
    // As a float, 9007199254740991 / 100 = 90071992547409.91 happens to round-trip,
    // but 9007199254740993 does not even exist as a double. The string path never touches it.
    const parts = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).formatToParts(koboToDecimalString(toKobo(Number.MAX_SAFE_INTEGER)))
    const digits = parts
      .filter((p) => p.type === 'integer' || p.type === 'fraction')
      .map((p) => p.value)
      .join('')
    expect(digits).toBe('9007199254740991')
  })

  it('supports explicit sign display for deltas', () => {
    expect(formatNaira(toKobo(100050), { signDisplay: 'always' })).toBe('+₦1,000.50')
    expect(formatNaira(toKobo(0), { signDisplay: 'always' })).toBe('+₦0.00')
    expect(formatNaira(toKobo(0), { signDisplay: 'exceptZero' })).toBe('₦0.00')
    expect(formatNaira(toKobo(-100050), { signDisplay: 'never' })).toBe('₦1,000.50')
  })

  it('uses only ASCII separators and hyphen-minus (no NBSP / U+2212 to trip tests or copy-paste)', () => {
    const out = formatNaira(toKobo(-100050))
    expect(out).not.toMatch(/[\u00a0\u202f\u2212]/u)
  })

  it('reuses one cached formatter instance', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat')
    formatNaira(toKobo(1))
    formatNaira(toKobo(2))
    expect(spy).not.toHaveBeenCalled() // already constructed by earlier calls in this file
  })
})
