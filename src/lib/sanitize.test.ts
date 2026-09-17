import { describe, expect, it } from 'vitest'

import { DESCRIPTION_MAX_LENGTH, sanitizeText } from './sanitize'

describe('sanitizeText', () => {
  it.each([
    ['plain text survives', 'Transfer from Adaeze Okafor', 'Transfer from Adaeze Okafor'],
    [
      'HTML is kept as literal text (React escapes it; we do not strip tags)',
      '<img src=x onerror=alert(1)>',
      '<img src=x onerror=alert(1)>',
    ],
    [
      'RTL override and pop-directional are removed',
      'Payment \u202Egnp.exe\u202C invoice',
      'Payment gnp.exe invoice',
    ],
    ['isolates are removed', 'a\u2066b\u2067c\u2068d\u2069e', 'abcde'],
    [
      'zero-width characters are removed',
      'Refund\u200B\u200B\u200C\u200D\u2060\uFEFF pending',
      'Refund pending',
    ],
    ['C0 controls and DEL are removed', 'Transfer\u0000from\u0007Musa\u007F', 'TransferfromMusa'],
    ['C1 controls are removed', 'a\u0085b\u009Fc', 'abc'],
    [
      'whitespace runs collapse to one space and ends are trimmed',
      '  Airtime \t\n top-up   ',
      'Airtime top-up',
    ],
    ['diacritics and emoji survive', 'Ọ̀ṣun market – Ìbàdàn 🍊', 'Ọ̀ṣun market – Ìbàdàn 🍊'],
    [
      'template and CSV payloads are inert text',
      '=HYPERLINK("http://evil.example","Open") ${7*7}',
      '=HYPERLINK("http://evil.example","Open") ${7*7}',
    ],
    ['empty input', '', ''],
  ])('%s', (_label, input, expected) => {
    expect(sanitizeText(input)).toBe(expected)
  })

  it('caps length with an ellipsis, never splitting a surrogate pair', () => {
    const long = 'Payment ' + 'A'.repeat(600)
    const out = sanitizeText(long)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH)
    expect(out.endsWith('…')).toBe(true)

    const emoji = '🍊'.repeat(200)
    const capped = sanitizeText(emoji)
    expect(capped.endsWith('…')).toBe(true)
    expect(capped).not.toMatch(/[\uD800-\uDBFF]…$/u) // lone high surrogate before the ellipsis
  })

  it('limits stacked combining marks ("zalgo") to two per base character', () => {
    const zalgo = 'Z\u0338\u0322\u0335\u0336a\u0337\u0321 text'
    expect(sanitizeText(zalgo)).toBe('Z\u0338\u0322a\u0337\u0321 text')
    expect(sanitizeText('Ọ̀')).toBe('Ọ̀') // ordinary Yoruba diacritics are untouched
  })

  it('accepts a custom max length', () => {
    expect(sanitizeText('abcdefghij', { maxLength: 5 })).toBe('abcd…')
  })

  it('tolerates non-string input defensively', () => {
    expect(sanitizeText(undefined as unknown as string)).toBe('')
    expect(sanitizeText(42 as unknown as string)).toBe('42')
  })
})
