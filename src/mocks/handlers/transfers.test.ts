import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_TRANSFER_KOBO } from '@/lib/limits'
import {
  type ApiError,
  type CreateTransferRequest,
  type Transfer,
  transferSchema,
} from '@/types/api'

import { setMockConfig } from '../config'
import { availableBalance, getDb } from '../db'
import { api, postJson, seedTestDb, TEST_NOW } from '@/test/api'

const KEY = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const KEY_2 = '00000000-0000-4000-8000-000000000002'

const request: CreateTransferRequest = {
  recipient: { accountNumber: '0123454821', bankCode: '058', accountName: 'ADAEZE OKAFOR' },
  amount: 250_000_00, // ₦250,000.00
  narration: 'Stock for October',
}

const post = (body: unknown = request, key: string | null = KEY) =>
  postJson<Transfer & ApiError>('/api/transfers', body, key ? { 'Idempotency-Key': key } : {})

describe('POST /api/transfers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => vi.useRealTimers())

  it('creates the transfer, debits the balance once, and adds a feed row', async () => {
    const db = getDb()
    const before = availableBalance(db)
    const rows = db.transactions.length

    const { status, body } = await post()
    expect(status).toBe(201)
    expect(transferSchema.safeParse(body).success).toBe(true)
    expect(body).toMatchObject({
      idempotencyKey: KEY,
      status: 'successful',
      amount: request.amount,
      narration: 'Stock for October',
      recipient: {
        accountName: 'ADAEZE OKAFOR',
        accountNumberMasked: '******4821',
        bankCode: '058',
        bankName: 'Guaranty Trust Bank',
      },
      balanceAfter: before - request.amount,
      createdAt: new Date(TEST_NOW).toISOString(),
    })
    expect(JSON.stringify(body)).not.toContain('0123454821') // full account number never leaves the server

    expect(availableBalance(db)).toBe(before - request.amount)
    expect(db.transactions).toHaveLength(rows + 1)
    const row = db.transactions[0]!
    expect(row).toMatchObject({
      id: body.transactionId,
      type: 'debit',
      status: 'successful',
      amount: request.amount,
      description: 'Stock for October',
      idempotencyKey: KEY,
      counterparty: { name: 'ADAEZE OKAFOR', accountNumberMasked: '******4821' },
    })
  })

  it('a duplicate Idempotency-Key returns the ORIGINAL transfer and debits exactly once', async () => {
    const db = getDb()
    const before = availableBalance(db)
    const rows = db.transactions.length

    const first = await post()
    const second = await post()
    const third = await post()

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.headers.get('Idempotent-Replayed')).toBe('true')
    expect(second.body).toEqual(first.body)
    expect(third.body).toEqual(first.body)

    expect(availableBalance(db)).toBe(before - request.amount)
    expect(db.transactions).toHaveLength(rows + 1)
    expect(db.transactions.filter((t) => t.idempotencyKey === KEY)).toHaveLength(1)
  })

  it('a reused key with a different payload is a 409 conflict (narration counts)', async () => {
    await post()
    const conflict = await post({ ...request, narration: 'Different narration' })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT')

    const differentKey = await post({ ...request, narration: 'Different narration' }, KEY_2)
    expect(differentKey.status).toBe(201)
  })

  it.each([
    [null, 'missing key'],
    ['not-a-uuid', 'malformed key'],
  ])('rejects %p (%s) with 400 before touching the ledger', async (key, _label) => {
    const before = availableBalance(getDb())
    const { status, body } = await post(request, key)
    expect(status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toHaveProperty('Idempotency-Key')
    expect(availableBalance(getDb())).toBe(before)
  })

  it.each([
    [{ ...request, amount: 19.99 }, 'amount'],
    [{ ...request, amount: 0 }, 'amount'],
    [{ ...request, amount: -100 }, 'amount'],
    [{ ...request, amount: '1000' }, 'amount'],
    [
      { ...request, recipient: { ...request.recipient, accountNumber: '123' } },
      'recipient.accountNumber',
    ],
    [
      { ...request, recipient: { ...request.recipient, accountName: '   ' } },
      'recipient.accountName',
    ],
    [{ ...request, narration: 'x'.repeat(101) }, 'narration'],
    [{}, 'recipient'],
  ])('validates the body: %o', async (body, field) => {
    const { status, body: res } = await post(body)
    expect(status).toBe(400)
    expect(res.error.code).toBe('VALIDATION_ERROR')
    expect(res.error.details).toHaveProperty(field)
  })

  it('rejects malformed JSON', async () => {
    const res = await api<ApiError>('/api/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': KEY },
      body: '{not json',
    })
    expect(res.status).toBe(400)
  })

  it('rejects an unknown bank', async () => {
    const { status, body } = await post({
      ...request,
      recipient: { ...request.recipient, bankCode: '000' },
    })
    expect(status).toBe(400)
    expect(body.error.details).toHaveProperty('recipient.bankCode')
  })

  it('enforces the per-transfer limit and available balance (422, nothing debited)', async () => {
    const db = getDb()
    const before = availableBalance(db)

    const tooBig = await post({ ...request, amount: MAX_TRANSFER_KOBO + 1 })
    expect(tooBig.status).toBe(422)
    expect(tooBig.body.error.code).toBe('LIMIT_EXCEEDED')

    const tooSmall = await post({ ...request, amount: 99 })
    expect(tooSmall.status).toBe(422)
    expect(tooSmall.body.error.code).toBe('LIMIT_EXCEEDED')

    const broke = await post({ ...request, amount: before + 1 })
    expect(broke.status).toBe(422)
    expect(broke.body.error.code).toBe('INSUFFICIENT_FUNDS')

    expect(availableBalance(db)).toBe(before)
    expect(db.idempotency.size).toBe(0) // a rejected transfer does not consume the key
  })

  it('transferFailureRate=1 returns a 500 WITH an error body (a definite failure) and no debit', async () => {
    setMockConfig({ transferFailureRate: 1 })
    const before = availableBalance(getDb())
    const { status, body } = await post()
    expect(status).toBe(500)
    expect(body.error.code).toBe('INTERNAL')
    expect(availableBalance(getDb())).toBe(before)
    expect(getDb().idempotency.has(KEY)).toBe(false)
  })

  describe('timeouts (the client never gets a response)', () => {
    const postWithTimeout = () =>
      fetch(new URL('/api/transfers', window.location.origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': KEY },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(50),
      })

    it('committed: the debit happened, GET /transfers/:key finds it, and a retry replays it', async () => {
      setMockConfig({ transferTimeoutRate: 1, timeoutMode: 'committed' })
      const db = getDb()
      const before = availableBalance(db)

      await expect(postWithTimeout()).rejects.toThrow()
      expect(availableBalance(db)).toBe(before - request.amount)

      const status = await api<Transfer>(`/api/transfers/${KEY}`)
      expect(status.status).toBe(200)
      expect(status.body.status).toBe('successful')
      expect(status.body.balanceAfter).toBe(before - request.amount)

      setMockConfig({ transferTimeoutRate: 0 })
      const retry = await post()
      expect(retry.status).toBe(200)
      expect(retry.headers.get('Idempotent-Replayed')).toBe('true')
      expect(availableBalance(db)).toBe(before - request.amount) // still debited once
    })

    it('dropped: nothing was committed, GET /transfers/:key is 404, and a retry with the same key succeeds', async () => {
      setMockConfig({ transferTimeoutRate: 1, timeoutMode: 'dropped' })
      const db = getDb()
      const before = availableBalance(db)

      await expect(postWithTimeout()).rejects.toThrow()
      expect(availableBalance(db)).toBe(before)

      const status = await api<ApiError>(`/api/transfers/${KEY}`)
      expect(status.status).toBe(404)
      expect(status.body.error.code).toBe('TRANSFER_NOT_FOUND')

      setMockConfig({ transferTimeoutRate: 0 })
      const retry = await post()
      expect(retry.status).toBe(201)
      expect(availableBalance(db)).toBe(before - request.amount)
    })
  })
})

describe('GET /api/transfers/:idempotencyKey', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW })
    seedTestDb()
  })
  afterEach(() => vi.useRealTimers())

  it('404s for an unknown key and returns the transfer after creation', async () => {
    expect((await api<ApiError>(`/api/transfers/${KEY}`)).status).toBe(404)
    const created = await post()
    const found = await api<Transfer>(`/api/transfers/${KEY}`)
    expect(found.status).toBe(200)
    expect(found.body).toEqual(created.body)
  })

  it('honours the read failureRate (polls can fail transiently)', async () => {
    await post()
    setMockConfig({ failureRate: 1 })
    expect((await api<ApiError>(`/api/transfers/${KEY}`)).status).toBe(500)
  })
})
