"use client"

import { useTranslations } from "next-intl"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { SearchInput } from "./SearchInput"
import type { Category } from "@/lib/generated/prisma/client"

interface BlogFiltersProps {
  categories: Category[]
}

export function BlogFilters({ categories }: BlogFiltersProps) {
  const t = useTranslations("blog")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentCategory = searchParams.get("category") ?? ""
  const currentSearch = searchParams.get("search") ?? ""

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
    },
    [router, pathname, searchParams]
  )

  return (
    <div className="space-y-4 mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => updateParams("category", "")}
          className={
            currentCategory === ""
              ? "rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium transition-colors"
              : "rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"
          }
        >
          {t("all")}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => updateParams("category", cat.id)}
            className={
              currentCategory === cat.id
                ? "rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium transition-colors"
                : "rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"
            }
          >
            {cat.name}
          </button>
        ))}
      </div>
      <SearchInput value={currentSearch} onChange={(v) => updateParams("search", v)} />
    </div>
  )
}
