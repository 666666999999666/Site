"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"

export default function LocaleNotFound() {
  const common = useTranslations("common")
  const errors = useTranslations("errors")

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl font-bold text-foreground">404</p>
      <h1 className="mt-4 text-2xl font-semibold">{errors("notFoundTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{errors("notFoundDescription")}</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {common("backHome")}
      </Link>
    </div>
  )
}
