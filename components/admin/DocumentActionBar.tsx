"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ArrowLeft, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"

export type DocumentMode = "read" | "edit" | "preview"

export function DocumentActionBar({
  mode, dirty, pending, ready, status, onBack, onEdit, onModeChange, onCancel, children,
}: {
  mode: DocumentMode
  dirty: boolean
  pending: boolean
  ready: boolean
  status: string
  onBack: () => void
  onEdit: () => void
  onModeChange: (mode: "edit" | "preview") => void
  onCancel: () => void
  children?: ReactNode
}) {
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const bar = barRef.current
    const document = bar?.closest<HTMLElement>(".admin-document")
    if (!bar || !document) return
    const update = () => document.style.setProperty("--document-toolbar-height", bar.offsetHeight + "px")
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    update()
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={barRef} className="document-action-bar sticky top-0 z-50 mb-8 flex flex-wrap items-center
      justify-between gap-3 border-b border-border bg-background py-3" aria-label="文档操作">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={pending || !ready}>
          <ArrowLeft className="size-4" /> 返回列表
        </Button>
        {mode !== "read" && (
          <div role="tablist" aria-label="正文模式" className="flex rounded-lg border border-border bg-muted/50 p-1">
            {(["edit", "preview"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={mode === item}
                aria-controls={"document-" + item} disabled={pending || !ready} onClick={() => onModeChange(item)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                  event.preventDefault()
                  const next = event.key === "Home" ? "edit" : event.key === "End" ? "preview" : item === "edit" ? "preview" : "edit"
                  onModeChange(next)
                  event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                    next === "edit" ? "button:first-child" : "button:last-child"
                  )?.focus()
                }}
                className={"rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (mode === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {item === "edit" ? "编辑" : "预览"}
              </button>
            ))}
          </div>
        )}
        <span role="status" className={"text-xs " + (dirty ? "text-primary" : "text-muted-foreground")}>
          {!ready ? "读取中…" : pending ? "保存中…" : dirty ? "有未保存的修改" : status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "read" ? (
          <Button type="button" size="sm" onClick={onEdit} disabled={pending || !ready}><Pencil className="size-4" /> 编辑</Button>
        ) : (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending || !ready}>取消编辑</Button>
            {children}
          </>
        )}
      </div>
    </div>
  )
}
