"use client"

import { Sun, Moon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "@/components/theme/ThemeProvider"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === "dark"
  const t = useTranslations("nav")

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      aria-label={dark ? t("switchLight") : t("switchDark")}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
