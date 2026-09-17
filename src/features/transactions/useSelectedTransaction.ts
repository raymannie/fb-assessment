import { useCallback, useRef, useSyncExternalStore } from 'react'

import { rememberOpener } from '@/lib/returnFocus'
import { getSearch, setSearch, subscribeSearch } from '@/lib/urlSearch'

export const TXN_PARAM = 'txn'

/**
 * The open transaction lives in the URL (`?txn=id`): deep-linkable, and the Android back button
 * closes the sheet because opening pushes a history entry. Closing goes *back* only if we pushed
 * that entry ourselves; a deep-linked visitor gets a replace so back doesn't leave the app.
 */
export function useSelectedTransaction() {
  const search = useSyncExternalStore(subscribeSearch, getSearch, () => '')
  const selectedId = new URLSearchParams(search).get(TXN_PARAM)
  const pushedByUs = useRef(false)

  const open = useCallback((id: string) => {
    const params = new URLSearchParams(getSearch())
    if (params.get(TXN_PARAM) === id) return
    params.set(TXN_PARAM, id)
    pushedByUs.current = true
    rememberOpener()
    setSearch(params)
  }, [])

  const close = useCallback(() => {
    const params = new URLSearchParams(getSearch())
    if (!params.has(TXN_PARAM)) return
    if (pushedByUs.current) {
      pushedByUs.current = false
      window.history.back()
      return
    }
    params.delete(TXN_PARAM)
    setSearch(params, { replace: true })
  }, [])

  return { selectedId, open, close }
}
