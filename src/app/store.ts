import { combineSlices, configureStore, createListenerMiddleware } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'

import { baseApi } from '@/api/baseApi'
import { announcerSlice } from '@/features/a11y/announcerSlice'
import { sendMoneySlice } from '@/features/send-money/sendMoneySlice'
import { writeStoredTheme } from '@/features/theme/theme'
import { setTheme, themeSlice, toggleTheme } from '@/features/theme/themeSlice'

// combineSlices lets lazily-loaded features inject their own reducers later
// (e.g. the Send Money slice arrives with its chunk) without touching this file.
const rootReducer = combineSlices(baseApi, themeSlice, announcerSlice, sendMoneySlice)
export type RootState = ReturnType<typeof rootReducer>

export const listenerMiddleware = createListenerMiddleware<RootState>()

// Side effects belong in listeners, not reducers: persist the theme preference.
listenerMiddleware.startListening({
  matcher: (action) => setTheme.match(action) || toggleTheme.match(action),
  effect: (_action, api) => {
    writeStoredTheme(api.getState().theme.preference)
  },
})

export function makeStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault().prepend(listenerMiddleware.middleware).concat(baseApi.middleware),
  })
  setupListeners(store.dispatch)
  return store
}

export type AppStore = ReturnType<typeof makeStore>
export type AppDispatch = AppStore['dispatch']
