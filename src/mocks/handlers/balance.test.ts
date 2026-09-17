import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lagosDateKey } from '@/lib/date'
import { sumKobo } from '@/lib/money'
import { type ApiError, type BalanceResponse, balanceResponseSchema } from '@/types/api'

import { setMockConfig } from '../config'
import { availableBalance, getDb } from '../db'
import { SEED_LEDGER_KOBO } from '../seed'
import { api, seedTestDb, TEST_NOW } from '@/test/api'

describe('GET /api/balance', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => vi.useRealTimers())

  it('returns the contract shape with today’s totals computed in Africa/Lagos', async () => {
    const { status, body } = await api<BalanceResponse>('/api/balance')
    expect(status).toBe(200)
    expect(balanceResponseSchema.safeParse(body).success).toBe(true)

    const db = getDb()
    const today = lagosDateKey(TEST_NOW)
    const todays = db.transactions.filter(
      (t) => t.status === 'successful' && lagosDateKey(Date.parse(t.createdAt)) === today,
    )
    expect(body.today).toEqual({
      date: today,
      timezone: 'Africa/Lagos',
      inflow: sumKobo(todays.filter((t) => t.type === 'credit').map((t) => t.amount)),
      outflow: sumKobo(todays.filter((t) => t.type === 'debit').map((t) => t.amount)),
    })
    expect(body.today.inflow).toBeGreaterThan(0)
    expect(body.ledger).toBe(SEED_LEDGER_KOBO)
    expect(body.available).toBe(availableBalance(db))
    expect(body.available).toBeLessThan(body.ledger) // pending debits are held
  })

  it('returns a 500 with an error body when failureRate is 1', async () => {
    setMockConfig({ failureRate: 1 })
    const { status, body } = await api<ApiError>('/api/balance')
    expect(status).toBe(500)
    expect(body.error.code).toBe('INTERNAL')
    expect(body.error.requestId).toMatch(/^req_/)
  })
})
