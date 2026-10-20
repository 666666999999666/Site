"use client"

import { useTranslations } from "next-intl"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { resetBlogFilters, updateBlogFilters } from "@/lib/blog-search"
import { SearchInput } from "./SearchInput"

interface BlogFiltersProps {
  categories: Array<{ id: string; name: string }>
}

export function BlogFilters({ categories }: BlogFiltersProps) {
  const t = useTranslations("blog")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const pendingQuery = useRef(query)
  const requestedQueries = useRef(new Set<string>())
  const [displayQuery, setDisplayQuery] = useState(query)
  const [resetVersion, setResetVersion] = useState(0)

  useEffect(() => {
    // A slower response to an earlier edit must not discard a newer combined filter.
    const isOwnNavigation = requestedQueries.current.delete(query)
    if (isOwnNavigation && query !== pendingQuery.current) return
    requestedQueries.current.clear()
    pendingQuery.current = query
    setDisplayQuery(query)
  }, [query])

  useEffect(() => {
    const restoreHistory = () => {
      const restored = new URLSearchParams(window.location.search).toString()
      requestedQueries.current.clear()
      pendingQuery.current = restored
      setDisplayQuery(restored)
      setResetVersion((version) => version + 1)
    }
    window.addEventListener("popstate", restoreHistory)
    return () => window.removeEventListener("popstate", restoreHistory)
  }, [])

  const displayedParams = new URLSearchParams(displayQuery)
  const currentCategory = displayedParams.get("category") ?? ""
  const currentSearch = displayedParams.get("search") ?? ""

  const navigate = useCallback((next: string) => {
    pendingQuery.current = next
    requestedQueries.current.add(next)
    setDisplayQuery(next)
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [router, pathname])

  const updateParams = useCallback((key: "search" | "category", value: string) => {
    navigate(updateBlogFilters(pendingQuery.current, key, value))
  }, [navigate])

  return (
    <div className="space-y-4 mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={currentCategory === ""}
          onClick={() => updateParams("category", "")}
          className={currentCategory === ""
            ? "rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium transition-colors"
            : "rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"}
        >
          {t("all")}
        </button>
        {categories.map((cat) => (
          <button
            type="button"
            aria-pressed={currentCategory === cat.id}
            key={cat.id}
            onClick={() => updateParams("category", cat.id)}
            className={currentCategory === cat.id
              ? "rounded-full bg-foreground text-background px-3 py-1 text-xs font-medium transition-colors"
              : "rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"}
          >
            {cat.name}
          </button>
        ))}
      </div>
      <SearchInput key={resetVersion} value={currentSearch} onChange={(value) => updateParams("search", value)} />
      {(currentCategory || currentSearch) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {currentSearch && <button type="button" onClick={() => { setResetVersion((version) => version + 1); updateParams("search", "") }} className="text-primary hover:underline">{t("clearSearch")}</button>}
          <button type="button" onClick={() => { setResetVersion((version) => version + 1); navigate(resetBlogFilters(pendingQuery.current)) }} className="text-primary hover:underline">{t("resetFilters")}</button>
        </div>
      )}
    </div>
  )
}
