import { HttpResponse, http } from 'msw'

import { matchesFilters } from '@/lib/transactionFilters'
import { type Transaction, type TransactionsPage, transactionsQuerySchema } from '@/types/api'

import { decodeCursor, encodeCursor, filtersHash } from '../cursor'
import { getDb } from '../db'
import { apiError, maybeReadFailure, simulateLatency, zodDetails } from './common'

/** Strictly after `cursor` in newest-first order. */
function isAfterCursor(t: Transaction, cursor: { createdAt: string; id: string }): boolean {
  return t.createdAt < cursor.createdAt || (t.createdAt === cursor.createdAt && t.id < cursor.id)
}

export const transactionHandlers = [
  http.get('/api/transactions/:id', async ({ params }) => {
    await simulateLatency()
    const failure = maybeReadFailure()
    if (failure) return failure
    const transaction = getDb().transactions.find((t) => t.id === String(params.id))
    if (!transaction) return apiError(404, 'TRANSACTION_NOT_FOUND', 'No transaction with that id')
    return HttpResponse.json(transaction)
  }),

  http.get('/api/transactions', async ({ request }) => {
    await simulateLatency()
    const failure = maybeReadFailure()
    if (failure) return failure

    const url = new URL(request.url)
    const parsed = transactionsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid query', zodDetails(parsed.error))
    }
    const { cursor, limit, ...filters } = parsed.data
    if (filters.from && filters.to && filters.from > filters.to) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid query', {
        from: '"from" must not be after "to"',
      })
    }

    const hash = filtersHash(filters)
    let position: { createdAt: string; id: string } | null = null
    if (cursor !== undefined) {
      const decoded = decodeCursor(cursor)
      if (decoded?.f !== hash) {
        return apiError(
          400,
          'INVALID_CURSOR',
          'Cursor is invalid or was issued for different filters',
        )
      }
      position = decoded
    }

    const db = getDb()
    const items: Transaction[] = []
    let hasMore = false
    for (const t of db.transactions) {
      if (position && !isAfterCursor(t, position)) continue
      if (!matchesFilters(t, filters)) continue
      if (items.length === limit) {
        hasMore = true
        break
      }
      items.push(t)
    }

    const last = items.at(-1)
    const body: TransactionsPage = {
      items,
      nextCursor:
        hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id, f: hash }) : null,
    }
    return HttpResponse.json(body)
  }),
]
