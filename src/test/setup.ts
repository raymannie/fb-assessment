import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

import { resetMockConfig } from '@/mocks/config'
import { resetDb } from '@/mocks/db'
import { server } from '@/mocks/server'

expect.extend(axeMatchers)

// jsdom lacks matchMedia; components read it for the "system" theme.
function installMatchMedia() {
  if (typeof window.matchMedia === 'function') return
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
installMatchMedia()

// jsdom lacks ResizeObserver; Radix and the virtualizer both need it.
if (typeof window.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
}

// Unhandled requests are a test bug: fail loudly rather than hang on a pending fetch.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.documentElement.classList.remove('dark')
  // Fresh mock data and zero-latency, zero-failure config for every test.
  resetMockConfig()
  resetDb()
})
afterAll(() => server.close())
