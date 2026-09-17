import { useEffect } from 'react'

import { useAppSelector } from '@/app/hooks'

import { applyResolvedTheme, resolveTheme } from './theme'
import { selectThemePreference } from './themeSlice'

/**
 * Applies the resolved theme to <html> and follows OS changes while the preference is "system".
 * Renders nothing; mounted once in Providers.
 */
export function ThemeEffect() {
  const preference = useAppSelector(selectThemePreference)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => applyResolvedTheme(resolveTheme(preference, media.matches))
    apply()
    if (preference !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])

  return null
}
