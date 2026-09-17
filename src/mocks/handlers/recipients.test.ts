import { describe, expect, it } from 'vitest'

import {
  type ApiError,
  type ResolveRecipientResponse,
  resolveRecipientResponseSchema,
} from '@/types/api'

import { api } from '@/test/api'

const resolve = (accountNumber: string, bankCode: string) =>
  api<ResolveRecipientResponse & ApiError>(
    `/api/recipients/resolve?${new URLSearchParams({ accountNumber, bankCode }).toString()}`,
  )

describe('GET /api/recipients/resolve', () => {
  it('resolves a deterministic, masked recipient', async () => {
    const first = await resolve('0123454821', '011')
    expect(first.status).toBe(200)
    expect(resolveRecipientResponseSchema.safeParse(first.body).success).toBe(true)
    expect(first.body.accountNumberMasked).toBe('******4821')
    expect(first.body.bankName).toBe('First Bank of Nigeria')
    expect(first.body.accountName).toMatch(/^[A-Z]+ [A-Z]+$/)

    const again = await resolve('0123454821', '011')
    expect(again.body.accountName).toBe(first.body.accountName)
    const otherBank = await resolve('0123454821', '058')
    expect(otherBank.body.accountName).not.toBe(first.body.accountName)
  })

  it('returns 404 for account numbers ending in 0', async () => {
    const { status, body } = await resolve('0123454820', '011')
    expect(status).toBe(404)
    expect(body.error.code).toBe('RECIPIENT_NOT_FOUND')
  })

  it.each([
    ['12345', '011', 'accountNumber'],
    ['01234548a1', '011', 'accountNumber'],
    ['0123454821', '', 'bankCode'],
    ['0123454821', '000', 'bankCode'],
  ])('rejects %p / %p', async (accountNumber, bankCode, field) => {
    const { status, body } = await resolve(accountNumber, bankCode)
    expect(status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toHaveProperty(field)
  })
})
