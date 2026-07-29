"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_EVENT = "qz-theme-change"

function preferredTheme(): Theme {
  const stored = localStorage.getItem("theme")
  if (stored === "light" || stored === "dark") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function getServerThemeSnapshot(): Theme {
  return "light"
}

function subscribeToTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (localStorage.getItem("theme")) return
    applyTheme(event.matches ? "dark" : "light")
    callback()
  }
  const onStorageChange = () => {
    applyTheme(preferredTheme())
    callback()
  }

  media.addEventListener("change", onSystemChange)
  window.addEventListener("storage", onStorageChange)
  window.addEventListener(THEME_EVENT, callback)
  return () => {
    media.removeEventListener("change", onSystemChange)
    window.removeEventListener("storage", onStorageChange)
    window.removeEventListener(THEME_EVENT, callback)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  const toggleTheme = useCallback(() => {
    const next = getThemeSnapshot() === "dark" ? "light" : "dark"
    localStorage.setItem("theme", next)
    applyTheme(next)
    window.dispatchEvent(new Event(THEME_EVENT))
  }, [])

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside ThemeProvider")
  return context
}
