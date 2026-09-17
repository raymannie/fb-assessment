/**
 * Money is ALWAYS an integer number of kobo (1/100 of a Naira).
 * The brand makes it a type error to pass a raw `number` where money is expected,
 * so every kobo value in the app has passed through `toKobo` / `isKobo` at its boundary.
 */
export type Kobo = number & { readonly __brand: 'Kobo' }

export const ZERO_KOBO = 0 as Kobo

/** True for any safe integer (positive, negative or zero). */
export function isKobo(value: unknown): value is Kobo {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/**
 * Brands a number as kobo. Throws on anything that is not a safe integer —
 * including `19.99 * 100` (= 1998.9999999999998), which is the whole point.
 */
export function toKobo(value: number): Kobo {
  if (!isKobo(value)) {
    throw new TypeError(`Expected an integer number of kobo, received ${String(value)}`)
  }
  // Normalise -0 so equality and string conversion behave.
  return (value === 0 ? 0 : value) as Kobo
}

function checked(result: number, op: string): Kobo {
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Kobo ${op} exceeded Number.MAX_SAFE_INTEGER`)
  }
  return result as Kobo
}

export function addKobo(a: Kobo, b: Kobo): Kobo {
  return checked(a + b, 'addition')
}

export function subtractKobo(a: Kobo, b: Kobo): Kobo {
  return checked(a - b, 'subtraction')
}
