import type { ReactNode } from 'react'
import { Provider } from 'react-redux'

import { Toaster } from '@/components/ui/sonner'
import { LiveRegions } from '@/features/a11y/LiveRegions'
import { ThemeEffect } from '@/features/theme/ThemeEffect'

import { makeStore, type AppStore } from './store'

const defaultStore = makeStore()

export function Providers({
  children,
  store = defaultStore,
}: {
  children: ReactNode
  store?: AppStore
}) {
  return (
    <Provider store={store}>
      <ThemeEffect />
      {children}
      <LiveRegions />
      <Toaster />
    </Provider>
  )
}
