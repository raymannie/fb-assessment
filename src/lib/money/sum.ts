import { type Kobo, ZERO_KOBO, addKobo } from './kobo'

/** Integer reduction over kobo. Throws RangeError rather than return an imprecise total. */
export function sumKobo(values: Iterable<Kobo>): Kobo {
  let total = ZERO_KOBO
  for (const value of values) total = addKobo(total, value)
  return total
}
