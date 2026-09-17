import { HttpResponse, http } from 'msw'

import { findBank } from '@/data/banks'
import { maskAccountNumber } from '@/lib/mask'
import { type ResolveRecipientResponse, resolveRecipientQuerySchema } from '@/types/api'

import { createPrng, hashString } from '../prng'
import { apiError, maybeReadFailure, simulateLatency, zodDetails } from './common'

const FIRST = [
  'ADAEZE',
  'CHUKWUEMEKA',
  'NGOZI',
  'TUNDE',
  'YETUNDE',
  'IBRAHIM',
  'AISHA',
  'EMEKA',
  'FUNKE',
  'MUSA',
  'ZAINAB',
  'OBINNA',
]
const LAST = [
  'OKAFOR',
  'ADEYEMI',
  'ABUBAKAR',
  'EZE',
  'BALOGUN',
  'NWOSU',
  'BELLO',
  'OKONKWO',
  'ADEBAYO',
  'LAWAL',
  'YUSUF',
]

/**
 * Deterministic name enquiry: the same account + bank always resolves to the same name,
 * and account numbers ending in "0" do not exist (demoable "not found" state).
 */
export function resolveRecipientName(accountNumber: string, bankCode: string): string | null {
  if (accountNumber.endsWith('0')) return null
  const p = createPrng(hashString(`${bankCode}:${accountNumber}`))
  return `${p.pick(FIRST)} ${p.pick(LAST)}`
}

export const recipientHandlers = [
  http.get('/api/recipients/resolve', async ({ request }) => {
    await simulateLatency()
    const failure = maybeReadFailure()
    if (failure) return failure

    const url = new URL(request.url)
    const parsed = resolveRecipientQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid query', zodDetails(parsed.error))
    }
    const { accountNumber, bankCode } = parsed.data
    const bank = findBank(bankCode)
    if (!bank)
      return apiError(400, 'VALIDATION_ERROR', 'Unknown bank', { bankCode: 'Unknown bank code' })

    const accountName = resolveRecipientName(accountNumber, bankCode)
    if (!accountName) {
      return apiError(404, 'RECIPIENT_NOT_FOUND', 'No account found for that number at this bank')
    }
    const body: ResolveRecipientResponse = {
      accountName,
      accountNumberMasked: maskAccountNumber(accountNumber),
      bankCode,
      bankName: bank.name,
    }
    return HttpResponse.json(body)
  }),
]
