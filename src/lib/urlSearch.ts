/**
 * Tiny external store over `location.search` so filters can live in the URL without a router.
 * Works with useSyncExternalStore; pushState/replaceState notify subscribers (browsers don't).
 */
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function subscribeSearch(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function getSearch(): string {
  return window.location.search
}

export function setSearch(
  params: URLSearchParams,
  { replace = false }: { replace?: boolean } = {},
): void {
  const query = params.toString()
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
  if (replace) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState(window.history.state, '', url)
  notify()
}
