import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { readStoredTheme, resolveTheme, systemPrefersDark, type ThemePreference } from './theme'

export interface ThemeState {
  preference: ThemePreference
}

export const initialThemeState: ThemeState = {
  preference: readStoredTheme(),
}

export const themeSlice = createSlice({
  name: 'theme',
  initialState: initialThemeState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemePreference>) {
      state.preference = action.payload
    },
    /** Flips between light and dark relative to what the user currently sees. */
    toggleTheme: {
      reducer(state, action: PayloadAction<{ prefersDark: boolean }>) {
        const current = resolveTheme(state.preference, action.payload.prefersDark)
        state.preference = current === 'dark' ? 'light' : 'dark'
      },
      prepare(prefersDark: boolean = systemPrefersDark()) {
        return { payload: { prefersDark } }
      },
    },
  },
  selectors: {
    selectThemePreference: (state) => state.preference,
  },
})

export const { setTheme, toggleTheme } = themeSlice.actions
export const { selectThemePreference } = themeSlice.selectors
