import { formatNaira, type Kobo } from '@/lib/money'
import type { ApiErrorCode, Transfer } from '@/types/api'

/**
 * Pure reconciliation state machine for one Send Money submission.
 *
 * `reconcile(submission, event)` returns the next submission and a list of *effects* — plain
 * data describing what the orchestrator (api/transfers.ts) must do to the RTK Query cache,
 * the live regions and the poll timer. Nothing here touches the store or the network, which
 * is what makes every transition unit-testable.
 */
export type SubmissionStatus = 'submitting' | 'succeeded' | 'failed' | 'confirming' | 'unresolved'

export interface SubmissionRecipient {
  accountName: string
  accountNumberMasked: string
  bankCode: string
  bankName: string
}

export interface Submission {
  idempotencyKey: string
  /** Id of the optimistic feed row: `opt_<key>`. */
  optimisticRowId: string
  amount: Kobo
  recipient: SubmissionRecipient
  narration?: string
  status: SubmissionStatus
  pollAttempt: number
  startedAt: string
  error?: { message: string; retryable: boolean }
  transfer?: Transfer
}

export type ReconcileEvent =
  | { type: 'RESPONSE_OK'; transfer: Transfer }
  | { type: 'RESPONSE_DEFINITE'; message: string; code?: ApiErrorCode | undefined }
  | { type: 'RESPONSE_UNKNOWN'; reason: string }
  | { type: 'POLL_RESULT'; transfer: Transfer }
  | { type: 'POLL_NOT_FOUND' }
  | { type: 'POLL_ERROR'; reason: string }
  | { type: 'CHECK_STATUS' }

export type Effect =
  | { type: 'COMMIT_SERVER_ROW'; transfer: Transfer }
  | { type: 'SET_BALANCE'; available: Kobo }
  | { type: 'UNDO_OPTIMISTIC' }
  | { type: 'INVALIDATE_BALANCE' }
  | { type: 'ANNOUNCE'; politeness: 'polite' | 'assertive'; message: string }
  | { type: 'TOAST'; kind: 'success' | 'error'; message: string }
  | { type: 'SCHEDULE_POLL'; attempt: number }

export const MAX_POLL_ATTEMPTS = 6

/** Active = money may be moving; no new submission may start and Confirm stays disabled. */
export const ACTIVE_STATUSES: readonly SubmissionStatus[] = [
  'submitting',
  'confirming',
  'unresolved',
]
/** Locked = the outcome is unknown; the shell shows a banner until it resolves. */
export const LOCKED_STATUSES: readonly SubmissionStatus[] = ['confirming', 'unresolved']

export function isActive(submission: Submission | null | undefined): boolean {
  return !!submission && ACTIVE_STATUSES.includes(submission.status)
}
export function isLocked(submission: Submission | null | undefined): boolean {
  return !!submission && LOCKED_STATUSES.includes(submission.status)
}

const none = (submission: Submission) => ({ submission, effects: [] as Effect[] })

function succeed(s: Submission, transfer: Transfer) {
  const message = `Sent ${formatNaira(s.amount)} to ${s.recipient.accountName}.`
  const submission: Submission = { ...s, status: 'succeeded', transfer, error: undefined }
  const effects: Effect[] = [
    { type: 'COMMIT_SERVER_ROW', transfer },
    { type: 'SET_BALANCE', available: transfer.balanceAfter },
    { type: 'INVALIDATE_BALANCE' },
    { type: 'ANNOUNCE', politeness: 'polite', message },
    { type: 'TOAST', kind: 'success', message },
  ]
  return { submission, effects }
}

function fail(s: Submission, message: string, retryable: boolean) {
  const submission: Submission = { ...s, status: 'failed', error: { message, retryable } }
  const effects: Effect[] = [
    { type: 'UNDO_OPTIMISTIC' },
    { type: 'INVALIDATE_BALANCE' },
    { type: 'ANNOUNCE', politeness: 'assertive', message: `Transfer failed: ${message}` },
    { type: 'TOAST', kind: 'error', message },
  ]
  return { submission, effects }
}

function keepConfirming(s: Submission, attempt: number) {
  if (attempt >= MAX_POLL_ATTEMPTS) {
    const submission: Submission = { ...s, status: 'unresolved', pollAttempt: attempt }
    const effects: Effect[] = [
      {
        type: 'ANNOUNCE',
        politeness: 'assertive',
        message: `We couldn’t confirm your transfer of ${formatNaira(s.amount)} to ${s.recipient.accountName}. Don’t send it again — use Check status.`,
      },
    ]
    return { submission, effects }
  }
  const submission: Submission = { ...s, status: 'confirming', pollAttempt: attempt }
  return { submission, effects: [{ type: 'SCHEDULE_POLL', attempt }] as Effect[] }
}

function settle(s: Submission, transfer: Transfer, attempt: number) {
  switch (transfer.status) {
    case 'successful':
      return succeed(s, transfer)
    case 'failed':
      return fail(s, transfer.failureReason ?? 'The bank rejected this transfer.', true)
    case 'pending':
      return keepConfirming(s, attempt)
  }
}

export function reconcile(
  s: Submission,
  event: ReconcileEvent,
): { submission: Submission; effects: Effect[] } {
  switch (s.status) {
    case 'submitting':
      switch (event.type) {
        case 'RESPONSE_OK':
          return settle(s, event.transfer, 0)
        case 'RESPONSE_DEFINITE':
          if (event.code === 'IDEMPOTENCY_CONFLICT') {
            return fail(
              s,
              'This transfer was already submitted with different details. Check your transactions before sending again.',
              false,
            )
          }
          return fail(s, event.message, true)
        case 'RESPONSE_UNKNOWN': {
          const submission: Submission = { ...s, status: 'confirming', pollAttempt: 0 }
          const effects: Effect[] = [
            {
              type: 'ANNOUNCE',
              politeness: 'polite',
              message: 'No reply from the bank yet. Confirming whether the transfer went through…',
            },
            { type: 'SCHEDULE_POLL', attempt: 0 },
          ]
          return { submission, effects }
        }
        default:
          return none(s)
      }

    case 'confirming':
      switch (event.type) {
        case 'POLL_RESULT':
          return settle(s, event.transfer, s.pollAttempt + 1)
        case 'POLL_NOT_FOUND':
          return fail(
            s,
            'The bank didn’t receive this transfer, so nothing was debited. You can retry safely.',
            true,
          )
        case 'POLL_ERROR':
          return keepConfirming(s, s.pollAttempt + 1)
        default:
          return none(s)
      }

    case 'unresolved':
      if (event.type === 'CHECK_STATUS') return keepConfirming(s, 0)
      return none(s)

    case 'succeeded':
    case 'failed':
      return none(s)
  }
}
