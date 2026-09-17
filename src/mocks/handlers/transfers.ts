import { HttpResponse, http } from 'msw'

import { findBank } from '@/data/banks'
import { MAX_TRANSFER_KOBO, MIN_TRANSFER_KOBO } from '@/lib/limits'
import { maskAccountNumber } from '@/lib/mask'
import { type Kobo, subtractKobo, toKobo } from '@/lib/money'
import {
  type CreateTransferRequest,
  createTransferRequestSchema,
  type Transaction,
  type Transfer,
} from '@/types/api'

import { getMockConfig } from '../config'
import {
  allocateTransactionId,
  availableBalance,
  getDb,
  insertTransaction,
  type MockDb,
} from '../db'
import {
  apiError,
  hangForever,
  maybeReadFailure,
  nextRequestId,
  simulateLatency,
  zodDetails,
} from './common'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same key + same fingerprint = replay; same key + different fingerprint = conflict. */
export function transferFingerprint(body: CreateTransferRequest): string {
  return JSON.stringify([
    body.recipient.accountNumber,
    body.recipient.bankCode,
    body.amount,
    body.narration ?? '',
  ])
}

/** Applies the debit atomically: ledger, feed row, idempotency record. */
export function commitTransfer(
  db: MockDb,
  key: string,
  body: CreateTransferRequest,
  fingerprint: string,
  now: number = Date.now(),
): Transfer {
  const amount = toKobo(body.amount)
  const bank = findBank(body.recipient.bankCode)
  const createdAt = new Date(now).toISOString()
  const transactionId = allocateTransactionId(db)
  const trimmed = body.narration?.trim()
  const narration = trimmed === '' ? undefined : trimmed
  const reference = `NIP${createdAt.slice(0, 10).replaceAll('-', '')}${nextRequestId().slice(-9).toUpperCase()}`

  db.ledger = subtractKobo(db.ledger, amount)

  const transaction: Transaction = {
    id: transactionId,
    type: 'debit',
    status: 'successful',
    amount,
    currency: 'NGN',
    description: narration ?? `Transfer to ${body.recipient.accountName}`,
    counterparty: {
      name: body.recipient.accountName,
      accountNumberMasked: maskAccountNumber(body.recipient.accountNumber),
      bankName: bank?.name ?? 'Unknown bank',
    },
    reference,
    createdAt,
    idempotencyKey: key,
  }
  insertTransaction(db, transaction)

  const transfer: Transfer = {
    id: `trf_${transactionId.slice(4)}`,
    idempotencyKey: key,
    status: 'successful',
    amount,
    recipient: {
      accountName: body.recipient.accountName,
      accountNumberMasked: transaction.counterparty.accountNumberMasked,
      bankCode: body.recipient.bankCode,
      bankName: transaction.counterparty.bankName,
    },
    ...(narration ? { narration } : {}),
    reference,
    transactionId,
    balanceAfter: availableBalance(db),
    createdAt,
    completedAt: createdAt,
  }
  db.idempotency.set(key, { fingerprint, transfer })
  return transfer
}

export const transferHandlers = [
  http.post('/api/transfers', async ({ request }) => {
    await simulateLatency()

    const key = request.headers.get('idempotency-key')
    if (!key || !UUID_PATTERN.test(key)) {
      return apiError(400, 'VALIDATION_ERROR', 'Idempotency-Key header must be a UUID', {
        'Idempotency-Key': 'Missing or malformed',
      })
    }

    let json: unknown
    try {
      json = await request.json()
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'Body must be JSON')
    }
    const parsed = createTransferRequestSchema.safeParse(json)
    if (!parsed.success) {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid transfer request', zodDetails(parsed.error))
    }
    const body = parsed.data
    const fingerprint = transferFingerprint(body)
    const db = getDb()

    // Replay check comes first: a retry of a committed transfer must never re-run rules or debit again.
    const existing = db.idempotency.get(key)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return apiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Idempotency-Key was already used with a different payload',
        )
      }
      return HttpResponse.json(existing.transfer, {
        status: 200,
        headers: { 'Idempotent-Replayed': 'true' },
      })
    }

    // Business rules.
    const amount = body.amount as Kobo
    if (!findBank(body.recipient.bankCode)) {
      return apiError(400, 'VALIDATION_ERROR', 'Unknown bank', {
        'recipient.bankCode': 'Unknown bank code',
      })
    }
    if (amount < MIN_TRANSFER_KOBO) {
      return apiError(422, 'LIMIT_EXCEEDED', 'Minimum transfer is ₦1.00')
    }
    if (amount > MAX_TRANSFER_KOBO) {
      return apiError(422, 'LIMIT_EXCEEDED', 'Amount exceeds the ₦5,000,000.00 per-transfer limit')
    }
    if (amount > availableBalance(db)) {
      return apiError(422, 'INSUFFICIENT_FUNDS', 'Insufficient available balance')
    }

    // Simulated faults (only for otherwise-valid transfers, so they are the interesting kind).
    const { transferFailureRate, transferTimeoutRate, timeoutMode } = getMockConfig()
    if (transferFailureRate > 0 && Math.random() < transferFailureRate) {
      return apiError(500, 'INTERNAL', 'Simulated server error (mock transferFailureRate)')
    }
    if (transferTimeoutRate > 0 && Math.random() < transferTimeoutRate) {
      if (timeoutMode === 'committed') commitTransfer(db, key, body, fingerprint)
      return hangForever()
    }

    return HttpResponse.json(commitTransfer(db, key, body, fingerprint), { status: 201 })
  }),

  http.get('/api/transfers/:idempotencyKey', async ({ params }) => {
    await simulateLatency()
    const failure = maybeReadFailure()
    if (failure) return failure
    const record = getDb().idempotency.get(String(params.idempotencyKey))
    if (!record) return apiError(404, 'TRANSFER_NOT_FOUND', 'No transfer with that Idempotency-Key')
    return HttpResponse.json(record.transfer)
  }),
]
