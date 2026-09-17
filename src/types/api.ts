import { z } from 'zod'

import type { Kobo } from '@/lib/money'

/**
 * API contract — zod schemas are the single source of truth; types are inferred.
 * The mock server validates requests with the request schemas; the client validates
 * responses with the response schemas in `transformResponse` (money fields get branded there).
 */

export const koboSchema = z
  .int()
  .nonnegative()
  .transform((n) => n as Kobo)

export const transactionStatusSchema = z.enum(['pending', 'successful', 'failed'])
export const transactionTypeSchema = z.enum(['credit', 'debit'])
export type TransactionStatus = z.infer<typeof transactionStatusSchema>
export type TransactionType = z.infer<typeof transactionTypeSchema>

export const counterpartySchema = z.object({
  name: z.string(),
  accountNumberMasked: z.string(),
  bankName: z.string(),
})
export type Counterparty = z.infer<typeof counterpartySchema>

export const transactionSchema = z.object({
  id: z.string(),
  type: transactionTypeSchema,
  status: transactionStatusSchema,
  amount: koboSchema,
  currency: z.literal('NGN'),
  description: z.string(),
  counterparty: counterpartySchema,
  reference: z.string(),
  createdAt: z.iso.datetime(),
  idempotencyKey: z.string().optional(),
})
export type Transaction = z.infer<typeof transactionSchema>

// ---------- GET /api/balance ----------
export const balanceResponseSchema = z.object({
  currency: z.literal('NGN'),
  available: koboSchema,
  ledger: koboSchema,
  asOf: z.iso.datetime(),
  today: z.object({
    date: z.iso.date(),
    timezone: z.literal('Africa/Lagos'),
    inflow: koboSchema,
    outflow: koboSchema,
  }),
})
export type BalanceResponse = z.infer<typeof balanceResponseSchema>

// ---------- GET /api/transactions ----------
export const transactionsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: transactionStatusSchema.optional(),
  type: transactionTypeSchema.optional(),
})
export type TransactionsQuery = z.input<typeof transactionsQuerySchema>
/** The filter subset of the query (everything except paging). */
export type TransactionFilters = Pick<TransactionsQuery, 'from' | 'to' | 'status' | 'type'>

export const transactionsPageSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
})
export type TransactionsPage = z.infer<typeof transactionsPageSchema>

// ---------- POST /api/transfers ----------
export const ACCOUNT_NUMBER_PATTERN = /^[0-9]{10}$/
export const NARRATION_MAX_LENGTH = 100

export const createTransferRequestSchema = z.object({
  recipient: z.object({
    accountNumber: z.string().regex(ACCOUNT_NUMBER_PATTERN, 'Account number must be 10 digits'),
    bankCode: z.string().min(1),
    accountName: z.string().trim().min(1).max(100),
  }),
  amount: z.int().positive(),
  narration: z.string().trim().max(NARRATION_MAX_LENGTH).optional(),
})
export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>

export const transferStatusSchema = z.enum(['pending', 'successful', 'failed'])
export type TransferStatus = z.infer<typeof transferStatusSchema>

export const transferSchema = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  status: transferStatusSchema,
  amount: koboSchema,
  recipient: z.object({
    accountName: z.string(),
    accountNumberMasked: z.string(),
    bankCode: z.string(),
    bankName: z.string(),
  }),
  narration: z.string().optional(),
  reference: z.string(),
  transactionId: z.string(),
  balanceAfter: koboSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  failureReason: z.string().optional(),
})
export type Transfer = z.infer<typeof transferSchema>

// ---------- GET /api/recipients/resolve ----------
export const resolveRecipientQuerySchema = z.object({
  accountNumber: z.string().regex(ACCOUNT_NUMBER_PATTERN, 'Account number must be 10 digits'),
  bankCode: z.string().min(1),
})
export const resolveRecipientResponseSchema = z.object({
  accountName: z.string(),
  accountNumberMasked: z.string(),
  bankCode: z.string(),
  bankName: z.string(),
})
export type ResolveRecipientResponse = z.infer<typeof resolveRecipientResponseSchema>

// ---------- Errors ----------
export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'INSUFFICIENT_FUNDS',
  'LIMIT_EXCEEDED',
  'RECIPIENT_NOT_FOUND',
  'INVALID_CURSOR',
  'TRANSFER_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.string()).optional(),
    requestId: z.string(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>
