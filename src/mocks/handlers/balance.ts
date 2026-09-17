import { HttpResponse, http } from 'msw'

import { lagosDateKey, lagosDayRange } from '@/lib/date'
import { sumKobo } from '@/lib/money'
import type { BalanceResponse } from '@/types/api'

import { availableBalance, getDb } from '../db'
import { maybeReadFailure, simulateLatency } from './common'

export function buildBalance(now: number = Date.now()): BalanceResponse {
  const db = getDb()
  const today = lagosDateKey(now)
  const { start, end } = lagosDayRange(today)
  const todays = db.transactions.filter((t) => {
    const at = Date.parse(t.createdAt)
    return t.status === 'successful' && at >= start && at < end
  })
  return {
    currency: 'NGN',
    available: availableBalance(db),
    ledger: db.ledger,
    asOf: new Date(now).toISOString(),
    today: {
      date: today,
      timezone: 'Africa/Lagos',
      inflow: sumKobo(todays.filter((t) => t.type === 'credit').map((t) => t.amount)),
      outflow: sumKobo(todays.filter((t) => t.type === 'debit').map((t) => t.amount)),
    },
  }
}

export const balanceHandlers = [
  http.get('/api/balance', async () => {
    await simulateLatency()
    return maybeReadFailure() ?? HttpResponse.json(buildBalance())
  }),
]
