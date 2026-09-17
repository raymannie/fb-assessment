import type { Kobo } from './kobo'

/**
 * Converts kobo to an exact decimal string ("100050" → "1000.50") with string slicing only.
 * Safe integers always stringify to plain digits (no exponent below 1e21), so this is exact
 * for the entire Kobo range. No division anywhere.
 */
export type DecimalString = `${number}`

export function koboToDecimalString(kobo: Kobo): DecimalString {
  const negative = kobo < 0
  const digits = String(Math.abs(kobo)).padStart(3, '0')
  const whole = digits.slice(0, -2)
  const fraction = digits.slice(-2)
  return `${negative ? '-' : ''}${whole}.${fraction}` as DecimalString
}

export type SignDisplay = 'auto' | 'always' | 'never' | 'exceptZero'

// One formatter per sign-display option; construction is the expensive part of Intl.
const formatters = new Map<SignDisplay, Intl.NumberFormat>()

function getFormatter(signDisplay: SignDisplay): Intl.NumberFormat {
  let formatter = formatters.get(signDisplay)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      currencyDisplay: 'symbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay,
    })
    formatters.set(signDisplay, formatter)
  }
  return formatter
}

/**
 * The only way money is rendered in the app. 100050 → "₦1,000.50".
 *
 * `Intl.NumberFormat#format` accepts a decimal *string* and formats it exactly (ES2023 /
 * Node ≥ 20), so we hand it the string built by `koboToDecimalString` and never a float.
 * The output is used verbatim — no string-splicing of the result.
 *
 * Locale quirks worth knowing:
 *  - `en-NG` with full ICU yields "₦" (U+20A6), ASCII "," and ".", and hyphen-minus for
 *    negatives ("-₦1,000.50"). Small-icu Node builds fall back to "NGN 1,000.50" with a
 *    non-breaking space (U+00A0); the test suite has a preflight that names this problem.
 *  - Other locales (e.g. `de-DE`) would use U+2212 MINUS SIGN or U+202F narrow NBSP; the
 *    locale is pinned to `en-NG` precisely so output is stable and greppable.
 */
export function formatNaira(kobo: Kobo, options: { signDisplay?: SignDisplay } = {}): string {
  return getFormatter(options.signDisplay ?? 'auto').format(
    // TS's lib types for format() accept number | bigint | string (Intl.NumberFormat v3).
    koboToDecimalString(kobo),
  )
}
