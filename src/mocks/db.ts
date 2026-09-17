import { type Kobo, subtractKobo, sumKobo } from '@/lib/money'
import type { Transaction, Transfer } from '@/types/api'

import { generateTransactions, SEED_LEDGER_KOBO } from './seed'

export interface IdempotencyRecord {
  fingerprint: string
  transfer: Transfer
}

export interface MockDb {
  readonly seed: number
  /** Always sorted newest first by (createdAt, id). */
  transactions: Transaction[]
  ledger: Kobo
  idempotency: Map<string, IdempotencyRecord>
  nextTransactionNumber: number
}

function envSeed(): number {
  const n = Number(import.meta.env.VITE_MOCK_SEED)
  return Number.isSafeInteger(n) && n > 0 ? n : 20260917
}

export function createDb(options: { seed?: number; now?: number } = {}): MockDb {
  const seed = options.seed ?? envSeed()
  const transactions = generateTransactions({ seed, now: options.now ?? Date.now() })
  return {
    seed,
    transactions,
    ledger: SEED_LEDGER_KOBO,
    idempotency: new Map(),
    nextTransactionNumber: transactions.length + 1,
  }
}

/** Pending debits are held against the ledger, so they reduce what can be spent. */
export function availableBalance(db: MockDb): Kobo {
  const holds = sumKobo(
    db.transactions
      .filter((t) => t.type === 'debit' && t.status === 'pending')
      .map((t) => t.amount),
  )
  return subtractKobo(db.ledger, holds)
}

export function allocateTransactionId(db: MockDb): string {
  const id = `txn_${String(db.nextTransactionNumber).padStart(6, '0')}`
  db.nextTransactionNumber += 1
  return id
}

/** Inserts keeping newest-first order. New rows are almost always at the head. */
export function insertTransaction(db: MockDb, transaction: Transaction): void {
  const index = db.transactions.findIndex(
    (t) =>
      t.createdAt < transaction.createdAt ||
      (t.createdAt === transaction.createdAt && t.id < transaction.id),
  )
  if (index === -1) db.transactions.push(transaction)
  else db.transactions.splice(index, 0, transaction)
}

let instance: MockDb = createDb()

export function getDb(): MockDb {
  return instance
}

/** Re-seeds. Tests call this between cases; the dev panel's "Reset data" calls it too. */
export function resetDb(options: { seed?: number; now?: number } = {}): MockDb {
  instance = createDb(options)
  return instance
}
