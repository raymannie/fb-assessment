/**
 * "Today" for a Nigerian merchant is the Africa/Lagos calendar day.
 * WAT is UTC+1 with no daylight saving, so a fixed offset is exact and avoids
 * depending on the host's timezone database.
 */
export const LAGOS_OFFSET_MS = 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

/** "YYYY-MM-DD" of the Lagos calendar day containing `at`. */
export function lagosDateKey(at: Date | number): string {
  const shifted = new Date(new Date(at).getTime() + LAGOS_OFFSET_MS)
  return shifted.toISOString().slice(0, 10)
}

/** UTC epoch range [start, end) for a Lagos calendar day given as "YYYY-MM-DD". */
export function lagosDayRange(dateKey: string): { start: number; end: number } {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number]
  const start = Date.UTC(y, m - 1, d) - LAGOS_OFFSET_MS
  return { start, end: start + DAY_MS }
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

/** Cached Lagos-time formatter, e.g. "17 Sept 2026, 11:00". */
export function formatLagosDateTime(iso: string, style: 'short' | 'medium' = 'medium'): string {
  let formatter = dateTimeFormatters.get(style)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: style,
      timeStyle: 'short',
    })
    dateTimeFormatters.set(style, formatter)
  }
  return formatter.format(new Date(iso))
}
