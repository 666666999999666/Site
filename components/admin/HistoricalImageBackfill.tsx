"use client"

import { useRef, useState } from "react"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import type { BackfillPreview } from "@/lib/historical-image-backfill"
import { Button } from "@/components/ui/button"

type ExecutionEntry = {
  filename: string
  url: string
  status: "ready" | "skipped" | "original-only" | "failed"
  message: string
  reason?: string
}

type ExecutionResult = {
  entries: ExecutionEntry[]
  ready: number
  skipped: number
  failed: number
  originalOnly: number
}

export function HistoricalImageBackfill() {
  const [preview, setPreview] = useState<BackfillPreview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const active = useRef(false)

  async function loadPreview() {
    if (active.current) return
    active.current = true
    setPending(true)
    setError("")
    try {
      const next = await apiRequest<BackfillPreview>("/api/admin/image-variants")
      setPreview(next)
      setSelected(next.entries.filter((entry) => entry.status !== "failed").map((entry) => entry.filename))
      setResult(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取预览失败")
    } finally {
      active.current = false
      setPending(false)
    }
  }

  async function execute(filenames = selected) {
    if (active.current || !preview || !filenames.length) return
    active.current = true
    setPending(true)
    setError("")
    try {
      setResult(await apiRequest<ExecutionResult>("/api/admin/image-variants", jsonRequest("POST", {
        previewToken: preview.previewToken,
        filenames,
      })))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "补齐失败，请重新预览后重试")
    } finally {
      active.current = false
      setPending(false)
    }
  }

  const failedNames = result?.entries.filter((entry) => entry.status === "failed").map((entry) => entry.filename) ?? []

  return (
    <div className="space-y-6" data-testid="image-variants-admin">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        仅补齐指定的六张站内历史图片。预览不会生成文件；执行只添加响应式资源和尺寸清单，原图、图片地址、正文、说明及显示宽度保持不变。已有合格资源会跳过。
      </p>
      <Button type="button" variant="outline" disabled={pending} onClick={loadPreview}>
        {pending && !preview ? "正在读取…" : preview ? "刷新处理清单" : "预览处理清单"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {preview && (
        <>
          <p className="text-sm text-muted-foreground">请核对以下清单，再明确执行。只生成比原图更小的资源，实际生成尺寸以执行结果为准。</p>
          <ul className="space-y-4" aria-label="历史图片处理清单">
            {preview.entries.map((entry) => {
              const output = result?.entries.find((item) => item.filename === entry.filename)
              return (
                <li key={entry.filename} data-testid="image-variant-entry" data-filename={entry.filename} className="rounded-xl border border-border p-4">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <input
                      id={`backfill-${entry.filename}`}
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-primary"
                      aria-label={`选择 ${entry.filename}`}
                      checked={selected.includes(entry.filename)}
                      disabled={pending || entry.status === "failed"}
                      onChange={(event) => setSelected((current) => event.target.checked
                        ? [...current, entry.filename]
                        : current.filter((name) => name !== entry.filename))}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <label htmlFor={`backfill-${entry.filename}`} className="block break-all font-mono text-xs sm:text-sm">{entry.filename}</label>
                      <p className="text-sm" data-image-preview-status={entry.status}>{entry.message}</p>
                      {entry.width && entry.height && <p className="text-xs text-muted-foreground">{entry.width} × {entry.height} · {entry.sourceBytes?.toLocaleString()} B</p>}
                      {entry.sourceSha256 && <p className="break-all font-mono text-xs text-muted-foreground">SHA-256：{entry.sourceSha256}</p>}
                      {entry.plannedFiles.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">拟生成资源</summary>
                          <ul className="mt-2 space-y-1 break-all font-mono">{entry.plannedFiles.map((file) => <li key={file}>{file}</li>)}</ul>
                        </details>
                      )}
                      {output && <p className={output.status === "failed" ? "text-sm text-destructive" : "text-sm"} data-image-result-status={output.status}>{output.message}</p>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={pending || selected.length === 0} onClick={() => execute()}>
              {pending ? "处理中，请稍候…" : `补齐所选图片（${selected.length}）`}
            </Button>
            {failedNames.length > 0 && <Button type="button" variant="outline" disabled={pending} onClick={() => execute(failedNames)}>重试失败图片</Button>}
          </div>
          {result && <p role="status" aria-live="polite" className="text-sm">本次结果：已生成 {result.ready}，已跳过 {result.skipped}，仅保留原图 {result.originalOnly}，失败 {result.failed}。</p>}
        </>
      )}
    </div>
  )
}
