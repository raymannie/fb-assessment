import { describe, expect, it, vi } from 'vitest'

import {
  applyResolvedTheme,
  isThemePreference,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredTheme,
} from './theme'

describe('resolveTheme', () => {
  it.each([
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)('%s + prefersDark=%s → %s', (pref, prefersDark, expected) => {
    expect(resolveTheme(pref, prefersDark)).toBe(expected)
  })
})

describe('storage helpers', () => {
  it('round-trips an explicit preference and removes "system"', () => {
    writeStoredTheme('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(readStoredTheme()).toBe('dark')
    writeStoredTheme('system')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(readStoredTheme()).toBe('system')
  })

  it('ignores garbage in storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '<script>')
    expect(readStoredTheme()).toBe('system')
    expect(isThemePreference('blue')).toBe(false)
  })

  it('degrades to "system" when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readStoredTheme()).toBe('system')
    expect(() => writeStoredTheme('dark')).not.toThrow()
    spy.mockRestore()
  })
})

describe('applyResolvedTheme', () => {
  it('toggles the dark class and color-scheme on the root element', () => {
    const root = document.createElement('html')
    applyResolvedTheme('dark', root)
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
    applyResolvedTheme('light', root)
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
  })
})
