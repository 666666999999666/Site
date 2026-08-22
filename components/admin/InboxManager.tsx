"use client"

import Link from "next/link"
import { FormEvent, useMemo, useRef, useState } from "react"
import { ArrowUpRight, RotateCcw, Send, Trash2 } from "lucide-react"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import type {
  InboxItemSummaryView,
  InboxItemView,
  InboxKindValue,
  InboxStatusValue,
} from "@/lib/inbox-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

const KIND_LABELS: Record<InboxKindValue, string> = {
  BLOG: "文章",
  IDEA: "Idea",
  TODO: "Todo",
}

const STATUS_LABELS: Record<InboxStatusValue, string> = {
  RECEIVED: "待执行",
  APPLIED: "已分流",
  FAILED: "失败",
}

const EVENT_LABELS: Record<string, string> = {
  RECEIVED: "已保存原文",
  APPLIED: "已创建目标",
  APPLY_FAILED: "分流失败",
  RETRY_REQUESTED: "已请求重试",
  APPLICATION_RECONCILED: "已核对既有执行结果",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value))
}

function newRequestKey() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function statusVariant(status: InboxStatusValue): "default" | "secondary" | "destructive" {
  if (status === "APPLIED") return "default"
  if (status === "FAILED") return "destructive"
  return "secondary"
}

function toSummary(item: InboxItemView): InboxItemSummaryView {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    failureCode: item.failureCode,
    failureMessage: item.failureMessage,
    createdAt: item.createdAt,
    appliedAt: item.appliedAt,
    updatedAt: item.updatedAt,
    execution: item.execution,
  }
}

function upsertItem(items: InboxItemSummaryView[], incoming: InboxItemSummaryView) {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function InboxManager({ initialItems }: { initialItems: InboxItemSummaryView[] }) {
  const [rawInput, setRawInput] = useState("")
  const [items, setItems] = useState(initialItems)
  const [kindFilter, setKindFilter] = useState<InboxKindValue | "ALL">("ALL")
  const [statusFilter, setStatusFilter] = useState<InboxStatusValue | "ALL">("ALL")
  const [pending, setPending] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [detailsById, setDetailsById] = useState<Record<string, InboxItemView>>({})
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({})
  const [error, setError] = useState("")
  const requestKeyRef = useRef<string | null>(null)

  const visibleItems = useMemo(() => items.filter((item) => (
    (kindFilter === "ALL" || item.kind === kindFilter)
    && (statusFilter === "ALL" || item.status === statusFilter)
  )), [items, kindFilter, statusFilter])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    requestKeyRef.current ??= newRequestKey()

    try {
      const item = await apiRequest<InboxItemView>(
        "/api/inbox/items",
        jsonRequest("POST", { rawInput, requestKey: requestKeyRef.current })
      )
      setItems((current) => upsertItem(current, toSummary(item)))
      setDetailsById((current) => ({ ...current, [item.id]: item }))
      setRawInput("")
      requestKeyRef.current = null
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败")
    } finally {
      setPending(false)
    }
  }

  async function retry(itemId: string) {
    if (retryingId) return
    setRetryingId(itemId)
    setError("")
    try {
      const item = await apiRequest<InboxItemView>(
        `/api/inbox/items/${encodeURIComponent(itemId)}/retry`,
        jsonRequest("POST", {})
      )
      setItems((current) => upsertItem(current, toSummary(item)))
      setDetailsById((current) => ({ ...current, [item.id]: item }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重试失败")
    } finally {
      setRetryingId(null)
    }
  }

  async function loadDetail(itemId: string) {
    if (detailsById[itemId] || loadingDetails[itemId]) return
    setLoadingDetails((current) => ({ ...current, [itemId]: true }))
    setError("")
    try {
      const detail = await apiRequest<InboxItemView>(
        `/api/inbox/items/${encodeURIComponent(itemId)}`
      )
      setDetailsById((current) => ({ ...current, [itemId]: detail }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "原文加载失败")
    } finally {
      setLoadingDetails((current) => ({ ...current, [itemId]: false }))
    }
  }

  async function deleteItem(itemId: string) {
    if (deletingId || retryingId) return
    const confirmed = window.confirm(
      "确定删除这条分流记录吗？原文和执行历史将永久删除，已经创建的文章、Idea 或 Todo 等正式内容会保留。"
    )
    if (!confirmed) return

    setDeletingId(itemId)
    setError("")
    try {
      await apiRequest<{ success: true }>(
        `/api/inbox/items/${encodeURIComponent(itemId)}`,
        jsonRequest("DELETE", {})
      )
      setItems((current) => current.filter((item) => item.id !== itemId))
      setDetailsById((current) => {
        const next = { ...current }
        delete next[itemId]
        return next
      })
      setLoadingDetails((current) => {
        const next = { ...current }
        delete next[itemId]
        return next
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  const characterCount = Array.from(rawInput).length

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>统一输入</CardTitle>
          <CardDescription>开头的第一个前缀决定保存位置；正文中的其他前缀按普通文字保留。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <code className="rounded-md bg-muted px-3 py-2">idea：自己的想法</code>
              <code className="rounded-md bg-muted px-3 py-2">文章：文章正文或网址</code>
              <code className="rounded-md bg-muted px-3 py-2">todo：准备执行的任务</code>
            </div>
            <Textarea
              aria-label="收件箱原文"
              className="min-h-48 resize-y font-mono"
              placeholder="idea：记录一个刚想到的点子……"
              value={rawInput}
              onChange={(event) => {
                setRawInput(event.target.value)
                requestKeyRef.current = null
              }}
              disabled={pending}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={characterCount > 100_000 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                {characterCount.toLocaleString("zh-CN")} / 100,000 字符
              </span>
              <Button type="submit" disabled={pending || characterCount === 0 || characterCount > 100_000}>
                <Send />
                {pending ? "正在分流…" : "保存并分流"}
              </Button>
            </div>
          </form>
          {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <section aria-labelledby="inbox-history-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="inbox-history-heading" className="text-xl font-semibold">最近分流记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">原文随记录保留；删除记录不会删除已经创建的正式内容。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm text-muted-foreground">
              类型
              <select
                className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-foreground"
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as InboxKindValue | "ALL")}
              >
                <option value="ALL">全部</option>
                <option value="BLOG">文章</option>
                <option value="IDEA">Idea</option>
                <option value="TODO">Todo</option>
              </select>
            </label>
            <label className="text-sm text-muted-foreground">
              状态
              <select
                className="ml-2 h-8 rounded-md border border-input bg-background px-2 text-foreground"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as InboxStatusValue | "ALL")}
              >
                <option value="ALL">全部</option>
                <option value="RECEIVED">待执行</option>
                <option value="APPLIED">已分流</option>
                <option value="FAILED">失败</option>
              </select>
            </label>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            暂无符合条件的记录。
          </div>
        ) : (
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <Card key={item.id} size="sm">
                <CardHeader>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                    <Badge variant={statusVariant(item.status)}>{STATUS_LABELS[item.status]}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.status === "FAILED" && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {item.failureMessage || "分流失败，可稍后重试。"}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {item.execution && (
                      <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={item.execution.targetHref}>
                        打开{KIND_LABELS[item.execution.targetType]}
                        <ArrowUpRight className="size-4" />
                      </Link>
                    )}
                    {(item.status === "FAILED" || item.status === "RECEIVED") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={retryingId !== null || deletingId !== null}
                        onClick={() => retry(item.id)}
                      >
                        <RotateCcw />
                        {retryingId === item.id ? "重试中…" : "重试"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deletingId !== null || retryingId !== null}
                      onClick={() => void deleteItem(item.id)}
                    >
                      <Trash2 />
                      {deletingId === item.id ? "删除中…" : "删除记录"}
                    </Button>
                  </div>
                  <details
                    className="rounded-md border border-border/60 p-3"
                    onToggle={(event) => {
                      if (event.currentTarget.open) void loadDetail(item.id)
                    }}
                  >
                    <summary className="cursor-pointer text-sm font-medium">查看不可编辑原文与执行历史</summary>
                    <div className="mt-3 space-y-4">
                      {detailsById[item.id] ? (
                        <>
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{detailsById[item.id].rawInput}</pre>
                          <ol className="space-y-1 text-xs text-muted-foreground">
                            {detailsById[item.id].events.map((event) => (
                              <li key={event.id}>
                                {formatDate(event.createdAt)} · {EVENT_LABELS[event.eventType] ?? event.eventType}
                              </li>
                            ))}
                          </ol>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {loadingDetails[item.id] ? "正在加载原文…" : "展开后加载原文。"}
                        </p>
                      )}
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
