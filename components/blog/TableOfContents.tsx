"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

interface Heading {
  id: string
  text: string
  level: number
}

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string>("")
  const t = useTranslations("blog")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px" }
    )

    for (const h of headings) {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav className="sticky top-20" aria-label={t("contentsLabel")}>
      <h4 className="text-sm font-medium text-foreground mb-3">{t("contents")}</h4>
      <ul className="space-y-0.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" })
                window.history.replaceState(null, "", `#${h.id}`)
              }}
              className={`block text-sm py-1 transition-colors ${
                h.level === 4 ? "pl-7" : h.level === 3 ? "pl-4" : "pl-2"
              } ${
                activeId === h.id
                  ? "text-foreground font-medium border-l-2 border-foreground -ml-px"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
