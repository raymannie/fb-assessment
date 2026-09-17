import { lagosDayRange } from '@/lib/date'
import type { Transaction, TransactionFilters } from '@/types/api'

/** Does this row belong in a feed filtered by `filters`? Shared by the mock server and the client's cache patching. */
export function matchesFilters(t: Transaction, filters: TransactionFilters): boolean {
  if (filters.status && t.status !== filters.status) return false
  if (filters.type && t.type !== filters.type) return false
  if (filters.from || filters.to) {
    const at = Date.parse(t.createdAt)
    if (filters.from && at < lagosDayRange(filters.from).start) return false
    if (filters.to && at >= lagosDayRange(filters.to).end) return false
  }
  return true
}
