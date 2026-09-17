/**
 * Theme preference helpers. This is the ONLY thing the app stores in localStorage.
 * Every storage access is guarded: Safari private mode, blocked site data and
 * jsdom-without-storage must all degrade to "system".
 */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'novabiz.theme'

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value)
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function writeStoredTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') globalThis.localStorage?.removeItem(THEME_STORAGE_KEY)
    else globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* storage unavailable: preference lives in memory for this session only */
  }
}

export function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  } catch {
    return false
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/** Mirrors the inline script in index.html so there is exactly one source of truth for the class name. */
export function applyResolvedTheme(
  resolved: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}
