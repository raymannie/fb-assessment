/**
 * Plain-text sanitizer for untrusted merchant/customer text (descriptions, names).
 *
 * React already escapes HTML on render, so tags are deliberately NOT stripped — "<b>" is
 * shown literally. What React cannot protect against is text that *renders misleadingly*:
 * bidi overrides (spoofed filenames/amounts), zero-width characters (hidden content,
 * homoglyph tricks), control characters, unbounded length, and combining-mark floods.
 */
export const DESCRIPTION_MAX_LENGTH = 140

// C0 + DEL + C1 controls (tab/newline included — they are collapsed as whitespace later).
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
// Bidi embeddings/overrides/isolates and zero-width / invisible formatting characters.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu
// A base character followed by more than two combining marks.
const EXCESS_COMBINING = /(\P{M}\p{M}{2})\p{M}+/gu
const WHITESPACE = /\s+/gu

export interface SanitizeOptions {
  maxLength?: number
}

export function sanitizeText(
  input: string,
  { maxLength = DESCRIPTION_MAX_LENGTH }: SanitizeOptions = {},
): string {
  if (input === null || input === undefined) return ''
  const text = String(input)
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(EXCESS_COMBINING, '$1')
    .replace(WHITESPACE, ' ')
    .trim()

  if (text.length <= maxLength) return text
  // Cut on a code-point boundary so a surrogate pair is never split before the ellipsis.
  let cut = ''
  for (const codePoint of text) {
    if (cut.length + codePoint.length > maxLength - 1) break
    cut += codePoint
  }
  return `${cut.trimEnd()}…`
}
