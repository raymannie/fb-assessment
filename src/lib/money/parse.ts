import type { Kobo } from './kobo'

export type ParseNairaError = 'empty' | 'invalid' | 'negative' | 'too_many_decimals' | 'too_large'

export type ParseNairaResult = { ok: true; kobo: Kobo } | { ok: false; error: ParseNairaError }

const MAX_SAFE_KOBO = BigInt(Number.MAX_SAFE_INTEGER)

// ASCII digits only: `\d` would also match non-Latin digits in some engines, and Intl
// input must be plain. Grouping commas are stripped before this runs.
const NAIRA_PATTERN = /^([0-9]*)(?:\.([0-9]*))?$/

/**
 * Parses user-typed Naira ("1,000.50") into kobo using string and integer logic only.
 * Never `parseFloat(input) * 100`: 19.99 * 100 === 1998.9999999999998.
 *
 * Accepts: digits, optional grouping commas, optional single decimal point with at most
 * two places, optional leading ₦ / NGN, surrounding whitespace. Zero is accepted here —
 * whether an amount must be > 0 is a form rule, not a parsing rule.
 * Rejects: negatives, signs, exponents, non-ASCII digits, > 2 decimals, > MAX_SAFE_INTEGER kobo.
 */
export function parseNairaInputToKobo(input: string): ParseNairaResult {
  let text = input.trim()
  if (text === '') return { ok: false, error: 'empty' }

  if (text.startsWith('-')) return { ok: false, error: 'negative' }

  // Tolerate a pasted currency prefix.
  text = text.replace(/^(?:₦|NGN)\s*/u, '')
  // Grouping separators are cosmetic; their placement is not validated.
  text = text.replace(/,(?=[0-9])/g, '')

  const match = NAIRA_PATTERN.exec(text)
  if (!match) return { ok: false, error: 'invalid' }

  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  if (whole === '' && fraction === '') return { ok: false, error: 'invalid' } // "." on its own
  if (fraction.length > 2) return { ok: false, error: 'too_many_decimals' }

  // Combine with integer math: whole * 100 + fraction padded to two places.
  const kobo = BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))
  if (kobo > MAX_SAFE_KOBO) return { ok: false, error: 'too_large' }

  return { ok: true, kobo: Number(kobo) as Kobo }
}
