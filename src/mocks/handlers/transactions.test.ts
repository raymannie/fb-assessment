import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lagosDateKey } from '@/lib/date'
import {
  type ApiError,
  type Transaction,
  type TransactionsPage,
  transactionsPageSchema,
} from '@/types/api'

import { encodeCursor, filtersHash } from '../cursor'
import { getDb } from '../db'
import { api, seedTestDb, TEST_NOW } from '@/test/api'

async function page(query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString()
  return api<TransactionsPage>(`/api/transactions${qs ? `?${qs}` : ''}`)
}

/** Follows nextCursor to the end and returns every row seen. */
async function walk(query: Record<string, string> = {}): Promise<Transaction[]> {
  const all: Transaction[] = []
  let cursor: string | null = null
  let guard = 0
  do {
    const { status, body } = await page(cursor ? { ...query, cursor } : query)
    expect(status).toBe(200)
    all.push(...body.items)
    cursor = body.nextCursor
    if (++guard > 200) throw new Error('pagination did not terminate')
  } while (cursor)
  return all
}

describe('GET /api/transactions/:id', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => vi.useRealTimers())

  it('returns one transaction by id, or 404', async () => {
    const target = getDb().transactions[123]!
    const found = await api<Transaction>(`/api/transactions/${target.id}`)
    expect(found.status).toBe(200)
    expect(found.body).toEqual(target)
    const missing = await api<ApiError>('/api/transactions/txn_999999')
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('TRANSACTION_NOT_FOUND')
  })
})

describe('GET /api/transactions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => vi.useRealTimers())

  it('returns the first page newest-first with a cursor, default limit 50', async () => {
    const { status, body } = await page()
    expect(status).toBe(200)
    expect(transactionsPageSchema.safeParse(body).success).toBe(true)
    expect(body.items).toHaveLength(50)
    expect(body.nextCursor).toEqual(expect.any(String))
    expect(body.items.map((t) => t.id)).toEqual(
      getDb()
        .transactions.slice(0, 50)
        .map((t) => t.id),
    )
  })

  it('walks every row exactly once via cursors', async () => {
    const all = await walk({ limit: '100' })
    expect(all).toHaveLength(getDb().transactions.length)
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
  })

  it('clamps limit to 100 and rejects limit 0', async () => {
    expect((await page({ limit: '100' })).body.items).toHaveLength(100)
    expect((await page({ limit: '101' })).status).toBe(400)
    expect((await page({ limit: '0' })).status).toBe(400)
  })

  it.each([
    [{ status: 'failed' }, (t: Transaction) => t.status === 'failed'],
    [{ status: 'pending' }, (t: Transaction) => t.status === 'pending'],
    [{ type: 'debit' }, (t: Transaction) => t.type === 'debit'],
    [
      { type: 'credit', status: 'successful' },
      (t: Transaction) => t.type === 'credit' && t.status === 'successful',
    ],
  ])('filters by %o across all pages', async (query, predicate) => {
    const all = await walk({ ...query, limit: '100' })
    const expected = getDb().transactions.filter(predicate)
    expect(all.map((t) => t.id)).toEqual(expected.map((t) => t.id))
  })

  it('filters by an inclusive Lagos-day date range', async () => {
    const to = lagosDateKey(TEST_NOW)
    const from = lagosDateKey(TEST_NOW - 3 * 24 * 60 * 60 * 1000)
    const all = await walk({ from, to, limit: '100' })
    expect(all.length).toBeGreaterThan(0)
    for (const t of all) {
      const day = lagosDateKey(Date.parse(t.createdAt))
      expect(day >= from && day <= to).toBe(true)
    }
    const expectedCount = getDb().transactions.filter((t) => {
      const day = lagosDateKey(Date.parse(t.createdAt))
      return day >= from && day <= to
    }).length
    expect(all).toHaveLength(expectedCount)
  })

  it('returns an empty page (no cursor) when nothing matches', async () => {
    const { status, body } = await page({ from: '2020-01-01', to: '2020-01-02' })
    expect(status).toBe(200)
    expect(body).toEqual({ items: [], nextCursor: null })
  })

  it.each([
    [{ status: 'bogus' }, 'status'],
    [{ type: 'transfer' }, 'type'],
    [{ from: '17/09/2026' }, 'from'],
    [{ from: '2026-09-17', to: '2026-09-01' }, 'from'],
  ])('rejects invalid query %o with field details', async (query, field) => {
    const { status, body } = await api<ApiError>(
      `/api/transactions?${new URLSearchParams(query).toString()}`,
    )
    expect(status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toHaveProperty(field)
  })

  it('rejects garbage cursors and cursors issued for other filters', async () => {
    const garbage = await api<ApiError>('/api/transactions?cursor=nope')
    expect(garbage.status).toBe(400)
    expect(garbage.body.error.code).toBe('INVALID_CURSOR')

    const first = await page({ type: 'debit' })
    const reused = await api<ApiError>(
      `/api/transactions?type=credit&cursor=${first.body.nextCursor}`,
    )
    expect(reused.status).toBe(400)
    expect(reused.body.error.code).toBe('INVALID_CURSOR')
  })

  it('is stable when a new row is inserted at the head between pages (keyset, not offset)', async () => {
    const first = await page({ limit: '10' })
    const db = getDb()
    db.transactions.unshift({
      ...db.transactions[0]!,
      id: 'txn_999999',
      createdAt: new Date(TEST_NOW + 1000).toISOString(),
    })
    const second = await page({ limit: '10', cursor: first.body.nextCursor! })
    const firstIds = new Set(first.body.items.map((t) => t.id))
    expect(second.body.items.some((t) => firstIds.has(t.id))).toBe(false)
    expect(second.body.items[0]!.id).toBe(db.transactions[11]!.id)
  })

  it('a hand-built cursor pointing past the end yields an empty last page', async () => {
    const cursor = encodeCursor({
      createdAt: '2000-01-01T00:00:00.000Z',
      id: 'txn_000000',
      f: filtersHash({}),
    })
    const { body } = await page({ cursor })
    expect(body).toEqual({ items: [], nextCursor: null })
  })
})
