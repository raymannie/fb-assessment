import { describe, expect, it } from 'vitest'

import { DAY_MS } from '@/lib/date'
import { isKobo } from '@/lib/money'

import {
  generateTransactions,
  HOSTILE_DESCRIPTIONS,
  SEED_DAYS,
  SEED_TRANSACTION_COUNT,
} from './seed'

const NOW = Date.parse('2026-09-17T10:00:00.000Z')

describe('generateTransactions', () => {
  const rows = generateTransactions({ seed: 42, now: NOW })

  it('produces 1,500+ rows, newest first, with a total order on (createdAt, id)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(1500)
    expect(rows.length).toBe(SEED_TRANSACTION_COUNT)
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!
      const cur = rows[i]!
      const ordered =
        prev.createdAt > cur.createdAt || (prev.createdAt === cur.createdAt && prev.id > cur.id)
      expect(ordered).toBe(true)
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it('is deterministic for a seed and different for another', () => {
    const again = generateTransactions({ seed: 42, now: NOW })
    expect(again).toEqual(rows)
    const other = generateTransactions({ seed: 43, now: NOW })
    expect(other.map((r) => r.amount)).not.toEqual(rows.map((r) => r.amount))
  })

  it('spans ~90 days ending now', () => {
    const times = rows.map((r) => Date.parse(r.createdAt))
    expect(Math.max(...times)).toBeLessThanOrEqual(NOW)
    expect(Math.min(...times)).toBeGreaterThanOrEqual(NOW - SEED_DAYS * DAY_MS)
    expect(NOW - Math.min(...times)).toBeGreaterThan((SEED_DAYS - 2) * DAY_MS)
  })

  it('mixes statuses and types, with pending rows only in the last 24h', () => {
    const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length
    expect(count((r) => r.type === 'credit')).toBeGreaterThan(rows.length * 0.5)
    expect(count((r) => r.type === 'debit')).toBeGreaterThan(rows.length * 0.2)
    expect(count((r) => r.status === 'failed')).toBeGreaterThan(20)
    const pending = rows.filter((r) => r.status === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    for (const r of pending) expect(NOW - Date.parse(r.createdAt)).toBeLessThan(DAY_MS)
  })

  it('has integer kobo amounts and masked account numbers only', () => {
    for (const r of rows) {
      expect(isKobo(r.amount)).toBe(true)
      expect(r.amount).toBeGreaterThan(0)
      expect(r.counterparty.accountNumberMasked).toMatch(/^\*{6}\d{4}$/)
    }
  })

  it('plants every hostile description, including one on the first page', () => {
    const descriptions = new Set(rows.map((r) => r.description))
    for (const hostile of HOSTILE_DESCRIPTIONS) expect(descriptions.has(hostile)).toBe(true)
    expect(rows.slice(0, 50).some((r) => HOSTILE_DESCRIPTIONS.includes(r.description))).toBe(true)
  })
})
