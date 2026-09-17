import { describe, expect, it } from 'vitest'

import { parseNairaInputToKobo } from './parse'

describe('parseNairaInputToKobo — accepted input', () => {
  it.each([
    ['19.99', 1999],
    ['0.1', 10],
    ['0.10', 10],
    ['1,000.50', 100050],
    ['1000.5', 100050],
    ['.5', 50],
    ['5.', 500],
    ['0', 0],
    ['0.00', 0],
    ['1', 100],
    ['0.01', 1],
    ['0.99', 99],
    ['007.50', 750], // leading zeros are harmless
    ['  250  ', 25000], // surrounding whitespace trimmed
    ['₦1,000.50', 100050], // pasted with the currency symbol
    ['1,234,567.89', 123456789],
    ['12,34,567.89', 123456789], // grouping is not validated, only stripped
    ['90071992547409.91', 9007199254740991], // exactly MAX_SAFE_INTEGER kobo
  ])('%p → %d kobo', (input, kobo) => {
    expect(parseNairaInputToKobo(input)).toEqual({ ok: true, kobo })
  })

  it('never goes through floating point (19.99 * 100 !== 1999)', () => {
    expect(19.99 * 100).not.toBe(1999)
    expect(parseNairaInputToKobo('19.99')).toEqual({ ok: true, kobo: 1999 })
  })
})

describe('parseNairaInputToKobo — rejected input', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'invalid'],
    ['1.2.3', 'invalid'],
    ['1,000,', 'invalid'],
    ['1 000', 'invalid'],
    ['1e3', 'invalid'],
    ['0x10', 'invalid'],
    ['١٠', 'invalid'], // non-ASCII digits are not accepted
    ['.', 'invalid'],
    ['-5', 'negative'],
    ['-0.01', 'negative'],
    ['+5', 'invalid'],
    ['1.999', 'too_many_decimals'],
    ['0.001', 'too_many_decimals'],
    ['90071992547409.92', 'too_large'], // MAX_SAFE_INTEGER + 1 kobo
    ['99999999999999999999', 'too_large'],
  ])('%p → error %p', (input, error) => {
    expect(parseNairaInputToKobo(input)).toEqual({ ok: false, error })
  })
})
