import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { getSearch, setSearch, subscribeSearch } from '@/lib/urlSearch'
import type { TransactionFilters } from '@/types/api'

import { parseFilters, serializeFilters } from './filterModel'

/** Filters live in the URL: shareable, back-button friendly, and no PII (dates and enums only). */
export function useFeedFilters() {
  const search = useSyncExternalStore(subscribeSearch, getSearch, () => '')
  const filters = useMemo(() => parseFilters(search), [search])

  const setFilters = useCallback((patch: Partial<TransactionFilters>) => {
    const next = { ...parseFilters(getSearch()), ...patch }
    setSearch(serializeFilters(next, getSearch()))
  }, [])

  const clearFilters = useCallback(() => {
    setSearch(serializeFilters({}, getSearch()))
  }, [])

  return { filters, setFilters, clearFilters }
}
