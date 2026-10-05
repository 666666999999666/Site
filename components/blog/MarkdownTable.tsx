"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

export function MarkdownTable({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const table = tableRef.current
    if (!viewport || !table) return
    const measure = () => setOverflowing(viewport.scrollWidth > viewport.clientWidth + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(table)
    measure()
    return () => observer.disconnect()
  }, [children])

  return (
    <div className="markdown-table my-6 min-w-0 max-w-full">
      {overflowing && (
        <p className="markdown-table-hint not-prose mb-2 text-xs text-muted-foreground">
          ↔ 左右滑动查看完整表格
        </p>
      )}
      <div
        ref={viewportRef}
        className="markdown-table-viewport max-w-full overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        role={overflowing ? "region" : undefined}
        aria-label={overflowing ? "可横向滚动的表格" : undefined}
        tabIndex={overflowing ? 0 : undefined}
      >
        <table ref={tableRef} className="border-collapse text-sm">{children}</table>
      </div>
    </div>
  )
}
