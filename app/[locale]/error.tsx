"use client"

import { useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useLocale()
  const common = useTranslations("common")
  const t = useTranslations("errors")

  useEffect(() => {
    console.error("[PublicPageError]", error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("pageDescription")}</p>
      <div className="mt-6 flex gap-3">
        <Button type="button" onClick={reset}>{common("retry")}</Button>
        <Link
          href="/"
          locale={locale}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          {common("backHome")}
        </Link>
      </div>
    </div>
  )
}
