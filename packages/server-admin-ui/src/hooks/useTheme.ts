import { ModeConfig, ThemeMode } from '@/store'
import { faCircleHalfStroke } from '@fortawesome/free-solid-svg-icons/faCircleHalfStroke'
import { faMoon } from '@fortawesome/free-solid-svg-icons/faMoon'
import { faSun } from '@fortawesome/free-solid-svg-icons/faSun'
import { useState, useEffect, useCallback } from 'react'

export const MODES: ModeConfig[] = [
  { mode: 'light', label: 'Light', icon: faSun },
  { mode: 'dark', label: 'Dark', icon: faMoon },
  { mode: 'auto', label: 'Auto', icon: faCircleHalfStroke }
]

const VALID_MODES = MODES.map((m) => m.mode)

const isValidTheme = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && VALID_MODES.includes(value as ThemeMode)

const getStoredTheme = (): ThemeMode | null => {
  const stored = localStorage.getItem('sk:theme')
  return isValidTheme(stored) ? stored : null
}

const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const getPreferredTheme = (): ThemeMode => getStoredTheme() ?? getSystemTheme()

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => getPreferredTheme())

  useEffect(() => {
    const resolved = theme === 'auto' ? getSystemTheme() : theme
    document.documentElement.setAttribute('data-bs-theme', resolved)
  }, [theme])

  useEffect(() => {
    if (theme !== 'auto') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => {
      document.documentElement.setAttribute(
        'data-bs-theme',
        mediaQuery.matches ? 'dark' : 'light'
      )
    }

    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem('sk:theme', mode)
    setThemeState(mode)
  }, [])

  return { theme, setTheme }
}
