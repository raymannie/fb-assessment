import { describe, expect, it } from 'vitest'

import { toKobo } from '@/lib/money'
import type { Transfer } from '@/types/api'

import { MAX_POLL_ATTEMPTS, reconcile, type Submission } from './reconciliation'

const KEY = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'

const base: Submission = {
  idempotencyKey: KEY,
  optimisticRowId: `opt_${KEY}`,
  amount: toKobo(250_000_00),
  recipient: {
    accountName: 'ADAEZE OKAFOR',
    accountNumberMasked: '******4821',
    bankCode: '058',
    bankName: 'Guaranty Trust Bank',
  },
  narration: 'Stock',
  status: 'submitting',
  pollAttempt: 0,
  startedAt: '2026-09-17T10:00:00.000Z',
}

const transfer = (status: Transfer['status']): Transfer => ({
  id: 'trf_1',
  idempotencyKey: KEY,
  status,
  amount: base.amount,
  recipient: base.recipient,
  narration: 'Stock',
  reference: 'NIP1',
  transactionId: 'txn_001601',
  balanceAfter: toKobo(1_974_296_25),
  createdAt: '2026-09-17T10:00:01.000Z',
  ...(status === 'failed' ? { failureReason: 'Beneficiary bank unavailable' } : {}),
})

const types = (effects: { type: string }[]) => effects.map((e) => e.type)
const at = (status: Submission['status'], extra: Partial<Submission> = {}): Submission => ({
  ...base,
  status,
  ...extra,
})

describe('reconcile — from submitting', () => {
  it('2xx → succeeded: commit server row, set balance from balanceAfter, invalidate balance, announce politely', () => {
    const { submission, effects } = reconcile(base, {
      type: 'RESPONSE_OK',
      transfer: transfer('successful'),
    })
    expect(submission.status).toBe('succeeded')
    expect(submission.transfer?.id).toBe('trf_1')
    expect(types(effects)).toEqual([
      'COMMIT_SERVER_ROW',
      'SET_BALANCE',
      'INVALIDATE_BALANCE',
      'ANNOUNCE',
      'TOAST',
    ])
    expect(effects).toContainEqual({ type: 'SET_BALANCE', available: toKobo(1_974_296_25) })
    expect(effects).toContainEqual({
      type: 'ANNOUNCE',
      politeness: 'polite',
      message: 'Sent ₦250,000.00 to ADAEZE OKAFOR.',
    })
    expect(types(effects)).not.toContain('UNDO_OPTIMISTIC')
  })

  it('definite failure → failed: undo, invalidate balance, announce assertively, retryable', () => {
    const { submission, effects } = reconcile(base, {
      type: 'RESPONSE_DEFINITE',
      message: 'Insufficient available balance',
      code: 'INSUFFICIENT_FUNDS',
    })
    expect(submission.status).toBe('failed')
    expect(submission.error).toEqual({ message: 'Insufficient available balance', retryable: true })
    expect(types(effects)).toEqual(['UNDO_OPTIMISTIC', 'INVALIDATE_BALANCE', 'ANNOUNCE', 'TOAST'])
    expect(effects).toContainEqual({
      type: 'ANNOUNCE',
      politeness: 'assertive',
      message: 'Transfer failed: Insufficient available balance',
    })
  })

  it('409 conflict → failed and NOT retryable (a new key could double-send)', () => {
    const { submission } = reconcile(base, {
      type: 'RESPONSE_DEFINITE',
      message: 'conflict',
      code: 'IDEMPOTENCY_CONFLICT',
    })
    expect(submission.status).toBe('failed')
    expect(submission.error?.retryable).toBe(false)
    expect(submission.error?.message).toMatch(/already submitted/i)
  })

  it('unknown outcome → confirming: NO undo, keep patches, schedule the first poll', () => {
    const { submission, effects } = reconcile(base, {
      type: 'RESPONSE_UNKNOWN',
      reason: 'TIMEOUT_ERROR',
    })
    expect(submission.status).toBe('confirming')
    expect(submission.pollAttempt).toBe(0)
    expect(types(effects)).toEqual(['ANNOUNCE', 'SCHEDULE_POLL'])
    expect(effects).toContainEqual({ type: 'SCHEDULE_POLL', attempt: 0 })
    expect(types(effects)).not.toContain('UNDO_OPTIMISTIC')
    expect(types(effects)).not.toContain('INVALIDATE_BALANCE')
  })
})

describe('reconcile — from confirming', () => {
  const confirming = at('confirming', { pollAttempt: 2 })

  it('poll finds successful → succeeded (same effects as a 2xx)', () => {
    const { submission, effects } = reconcile(confirming, {
      type: 'POLL_RESULT',
      transfer: transfer('successful'),
    })
    expect(submission.status).toBe('succeeded')
    expect(types(effects)).toEqual([
      'COMMIT_SERVER_ROW',
      'SET_BALANCE',
      'INVALIDATE_BALANCE',
      'ANNOUNCE',
      'TOAST',
    ])
  })

  it('poll finds failed → failed with the server reason and a rollback', () => {
    const { submission, effects } = reconcile(confirming, {
      type: 'POLL_RESULT',
      transfer: transfer('failed'),
    })
    expect(submission.status).toBe('failed')
    expect(submission.error?.message).toBe('Beneficiary bank unavailable')
    expect(types(effects)).toEqual(['UNDO_OPTIMISTIC', 'INVALIDATE_BALANCE', 'ANNOUNCE', 'TOAST'])
  })

  it('poll finds pending → keep confirming, next attempt scheduled', () => {
    const { submission, effects } = reconcile(confirming, {
      type: 'POLL_RESULT',
      transfer: transfer('pending'),
    })
    expect(submission.status).toBe('confirming')
    expect(submission.pollAttempt).toBe(3)
    expect(effects).toEqual([{ type: 'SCHEDULE_POLL', attempt: 3 }])
  })

  it('404 → failed "not received", rollback, retry reuses the same key', () => {
    const { submission, effects } = reconcile(confirming, { type: 'POLL_NOT_FOUND' })
    expect(submission.status).toBe('failed')
    expect(submission.error).toEqual({
      message: expect.stringMatching(/didn’t receive/i),
      retryable: true,
    })
    expect(submission.idempotencyKey).toBe(KEY)
    expect(types(effects)).toEqual(['UNDO_OPTIMISTIC', 'INVALIDATE_BALANCE', 'ANNOUNCE', 'TOAST'])
  })

  it('poll network error → keep confirming and retry with backoff', () => {
    const { submission, effects } = reconcile(confirming, {
      type: 'POLL_ERROR',
      reason: 'FETCH_ERROR',
    })
    expect(submission.status).toBe('confirming')
    expect(effects).toEqual([{ type: 'SCHEDULE_POLL', attempt: 3 }])
  })

  it('budget exhausted → unresolved: patches untouched, assertive warning, no more polls', () => {
    const last = at('confirming', { pollAttempt: MAX_POLL_ATTEMPTS - 1 })
    const { submission, effects } = reconcile(last, { type: 'POLL_ERROR', reason: 'FETCH_ERROR' })
    expect(submission.status).toBe('unresolved')
    expect(types(effects)).toEqual(['ANNOUNCE'])
    expect(effects[0]).toMatchObject({
      politeness: 'assertive',
      message: expect.stringMatching(/don’t send it again/i),
    })
  })
})

describe('reconcile — from unresolved', () => {
  it('CHECK_STATUS → confirming from attempt 0', () => {
    const { submission, effects } = reconcile(
      at('unresolved', { pollAttempt: MAX_POLL_ATTEMPTS }),
      { type: 'CHECK_STATUS' },
    )
    expect(submission.status).toBe('confirming')
    expect(submission.pollAttempt).toBe(0)
    expect(effects).toEqual([{ type: 'SCHEDULE_POLL', attempt: 0 }])
  })
})

describe('reconcile — illegal events are ignored', () => {
  it.each([
    ['succeeded', { type: 'RESPONSE_DEFINITE', message: 'late', code: undefined }],
    ['succeeded', { type: 'POLL_NOT_FOUND' }],
    ['failed', { type: 'RESPONSE_OK', transfer: transfer('successful') }],
    ['submitting', { type: 'POLL_RESULT', transfer: transfer('successful') }],
    ['submitting', { type: 'CHECK_STATUS' }],
    ['confirming', { type: 'RESPONSE_OK', transfer: transfer('successful') }],
  ] as const)('%s ignores %o', (status, event) => {
    const start = at(status)
    const { submission, effects } = reconcile(start, event)
    expect(submission).toBe(start)
    expect(effects).toEqual([])
  })
})
