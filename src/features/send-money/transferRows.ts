import type { Transaction, Transfer } from '@/types/api'

import type { Submission } from './reconciliation'

/** Empty/whitespace narration falls back to a generated description, as the server does. */
function describe(narration: string | undefined, accountName: string): string {
  const trimmed = narration?.trim()
  if (trimmed === undefined || trimmed === '') return `Transfer to ${accountName}`
  return trimmed
}

/** The row shown in the feed while the transfer is in flight. `status` stays a real API value. */
export function buildOptimisticRow(submission: Submission): Transaction {
  return {
    id: submission.optimisticRowId,
    type: 'debit',
    status: 'pending',
    amount: submission.amount,
    currency: 'NGN',
    description: describe(submission.narration, submission.recipient.accountName),
    counterparty: {
      name: submission.recipient.accountName,
      accountNumberMasked: submission.recipient.accountNumberMasked,
      bankName: submission.recipient.bankName,
    },
    reference: 'PENDING',
    createdAt: submission.startedAt,
    idempotencyKey: submission.idempotencyKey,
  }
}

/** Same mapping the server applies when it creates the feed row for a transfer. */
export function transferToTransaction(transfer: Transfer): Transaction {
  return {
    id: transfer.transactionId,
    type: 'debit',
    status: transfer.status,
    amount: transfer.amount,
    currency: 'NGN',
    description: describe(transfer.narration, transfer.recipient.accountName),
    counterparty: {
      name: transfer.recipient.accountName,
      accountNumberMasked: transfer.recipient.accountNumberMasked,
      bankName: transfer.recipient.bankName,
    },
    reference: transfer.reference,
    createdAt: transfer.createdAt,
    idempotencyKey: transfer.idempotencyKey,
  }
}
