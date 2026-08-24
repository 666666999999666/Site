"use client"

import { useEffect, useRef, useState } from "react"
import { List, X } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ContentHeading } from "@/lib/content"

export function MobileTableOfContents({ headings }: { headings: ContentHeading[] }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const t = useTranslations("blog")

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLElement>("a, button")?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key !== "Tab" || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>("a, button")]
        .filter((element) => !element.hasAttribute("disabled"))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  if (headings.length === 0) return null

  function close(restoreFocus = true) {
    setOpen(false)
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }

  function focusHeading(id: string) {
    setOpen(false)
    window.requestAnimationFrame(() => {
      const heading = document.getElementById(id)
      if (!heading) return
      const previousTabIndex = heading.getAttribute("tabindex")
      heading.setAttribute("tabindex", "-1")
      heading.focus({ preventScroll: true })
      heading.scrollIntoView({ behavior: "smooth", block: "start" })
      window.history.replaceState(null, "", `#${id}`)
      heading.addEventListener("blur", () => {
        if (previousTabIndex === null) heading.removeAttribute("tabindex")
        else heading.setAttribute("tabindex", previousTabIndex)
      }, { once: true })
    })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("openContents")}
        aria-expanded={open}
        aria-controls="mobile-article-contents"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))+4rem)] right-[max(1.5rem,env(safe-area-inset-right))] z-40 inline-flex size-12 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <List className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t("closeContents")}
            onClick={() => close()}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div
            ref={dialogRef}
            id="mobile-article-contents"
            role="dialog"
            aria-modal="true"
            aria-label={t("contentsLabel")}
            className="absolute inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="font-medium">{t("contents")}</h2>
              <button type="button" onClick={() => close()} aria-label={t("closeContents")} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <ol className="space-y-1 border-l border-border">
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a
                    href={`#${heading.id}`}
                    onClick={(event) => {
                      event.preventDefault()
                      focusHeading(heading.id)
                    }}
                    className={`block rounded-r-md py-2 pr-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${
                      heading.level === 4 ? "pl-8" : heading.level === 3 ? "pl-5" : "pl-3"
                    }`}
                  >
                    {heading.text}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
