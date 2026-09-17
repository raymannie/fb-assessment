import { describe, expect, it } from 'vitest'

import { toKobo } from '@/lib/money'

import type { Submission } from './reconciliation'
import {
  ensureIdempotencyKey,
  initialSendMoneyState,
  openDialog,
  resetAfterSuccess,
  sendMoneySlice,
  setAmount,
  setNarration,
  setRecipient,
  submissionStarted,
  submissionUpdated,
  type SendMoneyState,
} from './sendMoneySlice'

const reduce = sendMoneySlice.reducer
const recipient = {
  accountNumber: '0123454821',
  accountNumberMasked: '******4821',
  bankCode: '058',
  bankName: 'Guaranty Trust Bank',
  accountName: 'ADAEZE OKAFOR',
}

function withDraft(): SendMoneyState {
  let s = reduce(initialSendMoneyState, setRecipient(recipient))
  s = reduce(s, setAmount({ input: '2,500', kobo: toKobo(250_000) }))
  return reduce(s, setNarration('Stock'))
}

const submission = (key: string, status: Submission['status']): Submission => ({
  idempotencyKey: key,
  optimisticRowId: `opt_${key}`,
  amount: toKobo(250_000),
  recipient,
  status,
  pollAttempt: 0,
  startedAt: 'now',
})

describe('idempotency key lifecycle', () => {
  it('is generated on entering Review and reused while the payload is unchanged', () => {
    let s = reduce(withDraft(), ensureIdempotencyKey('key-1'))
    expect(s.idempotencyKey).toBe('key-1')
    s = reduce(s, ensureIdempotencyKey('key-2')) // Back → Next, nothing changed
    expect(s.idempotencyKey).toBe('key-1')
  })

  it.each([
    [
      'amount',
      (s: SendMoneyState) => reduce(s, setAmount({ input: '2,600', kobo: toKobo(260_000) })),
    ],
    [
      'recipient',
      (s: SendMoneyState) => reduce(s, setRecipient({ ...recipient, accountNumber: '0123454822' })),
    ],
    ['bank', (s: SendMoneyState) => reduce(s, setRecipient({ ...recipient, bankCode: '011' }))],
    ['narration', (s: SendMoneyState) => reduce(s, setNarration('Different'))],
  ])('is regenerated when the %s changes', (_what, change) => {
    let s = reduce(withDraft(), ensureIdempotencyKey('key-1'))
    s = change(s)
    s = reduce(s, ensureIdempotencyKey('key-2'))
    expect(s.idempotencyKey).toBe('key-2')
  })

  it('ignores whitespace-only narration edits', () => {
    let s = reduce(withDraft(), ensureIdempotencyKey('key-1'))
    s = reduce(s, setNarration('  Stock '))
    s = reduce(s, ensureIdempotencyKey('key-2'))
    expect(s.idempotencyKey).toBe('key-1')
  })

  it('is not generated for an incomplete draft', () => {
    const s = reduce(initialSendMoneyState, ensureIdempotencyKey('key-1'))
    expect(s.idempotencyKey).toBeNull()
  })

  it('is cleared after a successful transfer so the next one is fresh', () => {
    let s = reduce(withDraft(), ensureIdempotencyKey('key-1'))
    s = reduce(s, submissionStarted(submission('key-1', 'submitting')))
    s = reduce(s, submissionUpdated(submission('key-1', 'succeeded')))
    s = reduce(s, resetAfterSuccess())
    expect(s.idempotencyKey).toBeNull()
    expect(s.submission).toBeNull()
    expect(s.draft.recipient).toBeNull()
    expect(s.step).toBe('recipient')
  })

  it('reopening after success also starts fresh, but not mid-flight', () => {
    let s = reduce(withDraft(), ensureIdempotencyKey('key-1'))
    s = reduce(s, submissionStarted(submission('key-1', 'submitting')))
    s = reduce(s, openDialog())
    expect(s.submission?.status).toBe('submitting')
    s = reduce(s, submissionUpdated(submission('key-1', 'succeeded')))
    s = reduce(s, openDialog())
    expect(s.submission).toBeNull()
  })
})

describe('submission guards', () => {
  it('refuses to start a second submission while one is active', () => {
    let s = reduce(withDraft(), submissionStarted(submission('key-1', 'submitting')))
    s = reduce(s, submissionStarted(submission('key-2', 'submitting')))
    expect(s.submission?.idempotencyKey).toBe('key-1')

    s = reduce(s, submissionUpdated(submission('key-1', 'confirming')))
    s = reduce(s, submissionStarted(submission('key-2', 'submitting')))
    expect(s.submission?.idempotencyKey).toBe('key-1')

    s = reduce(s, submissionUpdated(submission('key-1', 'failed')))
    s = reduce(s, submissionStarted(submission('key-1', 'submitting'))) // retry: same key
    expect(s.submission?.status).toBe('submitting')
  })

  it('ignores updates for a different key (stale poll loop)', () => {
    let s = reduce(withDraft(), submissionStarted(submission('key-1', 'submitting')))
    s = reduce(s, submissionUpdated(submission('key-9', 'succeeded')))
    expect(s.submission?.status).toBe('submitting')
  })
})
