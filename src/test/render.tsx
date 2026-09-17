import { render, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'

import { Providers } from '@/app/providers'
import { makeStore, type AppStore, type RootState } from '@/app/store'

interface Options extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>
  store?: AppStore
}

/** Renders with a fresh store per test so cache state never leaks between tests. */
export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, store, ...options }: Options = {},
) {
  const testStore = store ?? makeStore(preloadedState)
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Providers store={testStore}>{children}</Providers>
  )
  return {
    user: userEvent.setup(),
    store: testStore,
    ...render(ui, { wrapper: Wrapper, ...options }),
  }
}
