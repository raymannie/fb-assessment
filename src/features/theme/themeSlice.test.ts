import { describe, expect, it } from 'vitest'

import { setTheme, themeSlice, toggleTheme } from './themeSlice'

const reduce = themeSlice.reducer

describe('themeSlice', () => {
  it('setTheme stores the preference', () => {
    expect(reduce({ preference: 'system' }, setTheme('dark')).preference).toBe('dark')
  })

  it.each([
    ['light', false, 'dark'],
    ['dark', false, 'light'],
    ['system', true, 'light'], // system resolves dark → user wants light
    ['system', false, 'dark'],
  ] as const)('toggle from %s (prefersDark=%s) → %s', (from, prefersDark, expected) => {
    expect(reduce({ preference: from }, toggleTheme(prefersDark)).preference).toBe(expected)
  })
})
