import { z } from 'zod'

import { findBank } from '@/data/banks'
import { MAX_TRANSFER_KOBO, MIN_TRANSFER_KOBO } from '@/lib/limits'
import { formatNaira, type Kobo, parseNairaInputToKobo } from '@/lib/money'
import { ACCOUNT_NUMBER_PATTERN, NARRATION_MAX_LENGTH } from '@/types/api'

export const recipientSchema = z.object({
  accountNumber: z.string().regex(ACCOUNT_NUMBER_PATTERN, 'Enter the 10-digit account number'),
  bankCode: z.string().refine((code) => findBank(code) !== undefined, 'Choose a bank'),
})
export type RecipientForm = z.infer<typeof recipientSchema>

const PARSE_MESSAGES = {
  empty: 'Enter an amount',
  invalid: 'Enter a valid amount, for example 1,000.50',
  negative: 'Amount can’t be negative',
  too_many_decimals: 'Use at most 2 decimal places (kobo)',
  too_large: 'Amount is too large',
} as const

/**
 * Amount is validated as the user typed it, then parsed with integer/string logic only.
 * `available` is the cached balance; when it is unknown the server still enforces it.
 */
export function makeAmountSchema(available: Kobo | null) {
  return z.object({
    amountInput: z.string().superRefine((input, ctx) => {
      const parsed = parseNairaInputToKobo(input)
      if (!parsed.ok) {
        ctx.addIssue({ code: 'custom', message: PARSE_MESSAGES[parsed.error] })
        return
      }
      if (parsed.kobo < MIN_TRANSFER_KOBO) {
        ctx.addIssue({
          code: 'custom',
          message: `Minimum transfer is ${formatNaira(MIN_TRANSFER_KOBO)}`,
        })
      } else if (parsed.kobo > MAX_TRANSFER_KOBO) {
        ctx.addIssue({
          code: 'custom',
          message: `Maximum per transfer is ${formatNaira(MAX_TRANSFER_KOBO)}`,
        })
      } else if (available !== null && parsed.kobo > available) {
        ctx.addIssue({
          code: 'custom',
          message: `Exceeds your available balance of ${formatNaira(available)}`,
        })
      }
    }),
    narration: z
      .string()
      .trim()
      .max(NARRATION_MAX_LENGTH, `Keep the narration under ${NARRATION_MAX_LENGTH} characters`),
  })
}
export type AmountForm = z.infer<ReturnType<typeof makeAmountSchema>>
