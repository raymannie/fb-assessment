import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSearch, setSearch, subscribeSearch } from './urlSearch'

describe('urlSearch store', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('pushes, notifies subscribers, and reflects popstate', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSearch(listener)

    setSearch(new URLSearchParams({ status: 'failed' }))
    expect(getSearch()).toBe('?status=failed')
    expect(listener).toHaveBeenCalledTimes(1)

    setSearch(new URLSearchParams({ status: 'failed' })) // no-op when unchanged
    expect(listener).toHaveBeenCalledTimes(1)

    setSearch(new URLSearchParams(), { replace: true })
    expect(getSearch()).toBe('')
    expect(listener).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    setSearch(new URLSearchParams({ type: 'debit' }))
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
