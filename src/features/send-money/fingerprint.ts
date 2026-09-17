import type { Kobo } from '@/lib/money'

/**
 * What the Idempotency-Key is bound to. Mirrors the mock server's fingerprint: if any of these
 * change, a new key is generated — reusing the old one would replay the old transfer (or 409).
 */
export function transferFingerprint(input: {
  accountNumber: string
  bankCode: string
  amount: Kobo
  narration: string
}): string {
  return JSON.stringify([input.accountNumber, input.bankCode, input.amount, input.narration.trim()])
}
