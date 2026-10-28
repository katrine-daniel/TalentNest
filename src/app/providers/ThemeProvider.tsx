import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { THEME_KEY } from '@/config/env'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeValue {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference(p: ThemePreference): void
}

const ThemeContext = createContext<ThemeValue | null>(null)

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

/** Applies `data-theme` on <html>; colour tokens in styles/index.css switch accordingly. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference)
  const [osDark, setOsDark] = useState(systemDark)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOsDark(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' = preference === 'system' ? (osDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
    try {
      localStorage.setItem(THEME_KEY, preference)
    } catch {
      /* preference is optional */
    }
  }, [resolved, preference])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
