import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type Politeness = 'polite' | 'assertive'

interface Announcement {
  /** Increments on every announcement so identical text is re-announced. */
  id: number
  text: string
}

export interface AnnouncerState {
  polite: Announcement
  assertive: Announcement
}

const initialState: AnnouncerState = {
  polite: { id: 0, text: '' },
  assertive: { id: 0, text: '' },
}

/**
 * One polite and one assertive live region for the whole app (mounted once in Providers, so
 * they exist before the first announcement). Anything can announce by dispatching here.
 */
export const announcerSlice = createSlice({
  name: 'announcer',
  initialState,
  reducers: {
    announce(state, action: PayloadAction<{ politeness: Politeness; message: string }>) {
      const slot = state[action.payload.politeness]
      slot.id += 1
      slot.text = action.payload.message
    },
  },
  selectors: {
    selectPolite: (state) => state.polite,
    selectAssertive: (state) => state.assertive,
  },
})

export const { announce } = announcerSlice.actions
export const { selectPolite, selectAssertive } = announcerSlice.selectors
