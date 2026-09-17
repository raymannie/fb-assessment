import { MoonIcon, SunIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'

import { resolveTheme } from './theme'
import { selectThemePreference, toggleTheme } from './themeSlice'

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const getSystemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export function ThemeToggle() {
  const dispatch = useAppDispatch()
  const preference = useAppSelector(selectThemePreference)
  const prefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemPrefersDark,
    () => false,
  )
  const resolved = resolveTheme(preference, prefersDark)
  const next = resolved === 'dark' ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => dispatch(toggleTheme(prefersDark))}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {resolved === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}
