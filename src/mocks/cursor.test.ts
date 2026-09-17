import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor, filtersHash } from './cursor'

describe('cursor', () => {
  it('round-trips and is URL-safe', () => {
    const payload = { createdAt: '2026-09-17T10:00:00.000Z', id: 'txn_000123', f: filtersHash({}) }
    const cursor = encodeCursor(payload)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(cursor)).toEqual({ v: 1, ...payload })
  })

  it.each(['', 'not-base64!', btoa('{"v":2}'), btoa('[]'), btoa('{"v":1,"id":1}'), 'e30'])(
    'rejects malformed cursor %p',
    (cursor) => {
      expect(decodeCursor(cursor)).toBeNull()
    },
  )

  it('hashes filters order-independently and distinctly', () => {
    expect(filtersHash({ status: 'failed', type: 'debit' })).toBe(
      filtersHash({ type: 'debit', status: 'failed' }),
    )
    expect(filtersHash({ status: 'failed' })).not.toBe(filtersHash({ status: 'pending' }))
    expect(filtersHash({})).not.toBe(filtersHash({ from: '2026-09-01' }))
  })
})
