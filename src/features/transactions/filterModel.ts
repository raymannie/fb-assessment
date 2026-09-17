import { z } from 'zod'

import {
  type TransactionFilters,
  transactionStatusSchema,
  transactionTypeSchema,
} from '@/types/api'

/** URL params are untrusted input: anything malformed is dropped, never thrown. */
const filterSchema = z.object({
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  status: transactionStatusSchema.optional().catch(undefined),
  type: transactionTypeSchema.optional().catch(undefined),
})

export const FILTER_KEYS = ['from', 'to', 'status', 'type'] as const

export function parseFilters(search: string): TransactionFilters {
  const params = new URLSearchParams(search)
  const parsed = filterSchema.parse({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    status: params.get('status') ?? undefined,
    type: params.get('type') ?? undefined,
  })
  // An inverted range would 400 on the server; treat it as "no range".
  if (parsed.from && parsed.to && parsed.from > parsed.to) {
    delete parsed.from
    delete parsed.to
  }
  return stripUndefined(parsed)
}

/** Writes filters into a copy of `search`, preserving unrelated params. */
export function serializeFilters(filters: TransactionFilters, search = ''): URLSearchParams {
  const params = new URLSearchParams(search)
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (value) params.set(key, value)
    else params.delete(key)
  }
  return params
}

export function countActiveFilters(filters: TransactionFilters): number {
  return FILTER_KEYS.filter((key) => Boolean(filters[key])).length
}

function stripUndefined(filters: TransactionFilters): TransactionFilters {
  const out: TransactionFilters = {}
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (value !== undefined) (out as Record<string, string>)[key] = value
  }
  return out
}
