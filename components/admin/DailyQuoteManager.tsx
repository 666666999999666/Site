"use client"

import { FormEvent, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  MessageSquareQuote,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface QuoteItem {
  id: number
  quote: string
  category: string
  author: string | null
  source: string | null
  sourceDetail: string | null
  status: boolean
  assignedDate: string | null
  createdAt: string
  updatedAt: string
}

interface QuotePageData {
  items: QuoteItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  categories: string[]
  replacements: Array<{ id: number; quote: string }>
}

interface QuoteDraft {
  quote: string
  category: string
  author: string
  source: string
  sourceDetail: string
  status: boolean
  replacementQuoteId: string
}

const EMPTY_DRAFT: QuoteDraft = {
  quote: "",
  category: "专注",
  author: "QZ Site",
  source: "每日提醒语",
  sourceDetail: "",
  status: true,
  replacementQuoteId: "",
}

export function DailyQuoteManager({ initialData }: { initialData: QuotePageData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [appliedQuery, setAppliedQuery] = useState("")
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all")
  const [editing, setEditing] = useState<QuoteItem | "new" | null>(null)
  const [draft, setDraft] = useState<QuoteDraft>(EMPTY_DRAFT)
  const [deleteTarget, setDeleteTarget] = useState<QuoteItem | null>(null)
  const [deleteReplacementId, setDeleteReplacementId] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function load(next: {
    page?: number
    query?: string
    status?: "all" | "active" | "inactive"
  } = {}) {
    const page = next.page ?? data.page
    const nextQuery = next.query ?? appliedQuery
    const nextStatus = next.status ?? status
    setPending(true)
    setError("")
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(data.pageSize),
        query: nextQuery,
        status: nextStatus,
      })
      const result = await apiRequest<QuotePageData>(`/api/daily/quotes?${params}`)
      setData(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败")
    } finally {
      setPending(false)
    }
  }

  function beginCreate() {
    setEditing("new")
    setDraft(EMPTY_DRAFT)
    setDeleteTarget(null)
    setError("")
  }

  function beginEdit(item: QuoteItem) {
    setEditing(item)
    setDraft({
      quote: item.quote,
      category: item.category,
      author: item.author ?? "",
      source: item.source ?? "",
      sourceDetail: item.sourceDetail ?? "",
      status: item.status,
      replacementQuoteId: "",
    })
    setDeleteTarget(null)
    setError("")
  }

  async function submitQuote(event: FormEvent) {
    event.preventDefault()
    if (!editing || !draft.quote.trim() || !draft.category.trim()) return
    const assignedDisable = editing !== "new" && Boolean(editing.assignedDate) && !draft.status
    if (assignedDisable && !draft.replacementQuoteId) {
      setError("停用已分配的提醒语前，请选择一条未分配提醒语接替该日期")
      return
    }

    setPending(true)
    setError("")
    try {
      const body = {
        quote: draft.quote,
        category: draft.category,
        author: draft.author || null,
        source: draft.source || null,
        sourceDetail: draft.sourceDetail || null,
        status: draft.status,
        ...(editing !== "new" ? {
          replacementQuoteId: draft.replacementQuoteId
            ? Number(draft.replacementQuoteId)
            : null,
        } : {}),
      }
      if (editing === "new") {
        await apiRequest("/api/daily/quotes", jsonRequest("POST", body))
      } else {
        await apiRequest(`/api/daily/quotes/${editing.id}`, jsonRequest("PATCH", body))
      }
      setEditing(null)
      await load({ page: editing === "new" ? 1 : data.page })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      setPending(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.assignedDate && !deleteReplacementId) {
      setError("删除已分配的提醒语前，请选择一条未分配提醒语接替该日期")
      return
    }
    setPending(true)
    setError("")
    try {
      const params = deleteReplacementId
        ? `?replacementQuoteId=${encodeURIComponent(deleteReplacementId)}`
        : ""
      await apiRequest(`/api/daily/quotes/${deleteTarget.id}${params}`, { method: "DELETE" })
      setDeleteTarget(null)
      setDeleteReplacementId("")
      await load({ page: data.items.length === 1 && data.page > 1 ? data.page - 1 : data.page })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败")
    } finally {
      setPending(false)
    }
  }

  function applySearch(event: FormEvent) {
    event.preventDefault()
    const normalized = query.trim()
    setAppliedQuery(normalized)
    void load({ page: 1, query: normalized })
  }

  function applyStatus(nextStatus: "all" | "active" | "inactive") {
    setStatus(nextStatus)
    void load({ page: 1, status: nextStatus })
  }

  const assignedDisable = editing !== null && editing !== "new" && Boolean(editing.assignedDate) && !draft.status

  return (
    <div className="animate-in fade-in duration-300">
      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquareQuote className="size-4" />
            {data.total} 条提醒语
          </p>
          <h1 className="text-3xl font-semibold">每日提醒语</h1>
        </div>
        <Button type="button" className="h-11 gap-2 self-start px-4 sm:self-auto" onClick={beginCreate}>
          <Plus className="size-4" />
          新增提醒语
        </Button>
      </header>

      {editing && (
        <section className="border-b border-border/60 py-7" aria-labelledby="quote-form-title">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 id="quote-form-title" className="text-lg font-semibold">
              {editing === "new" ? "新增提醒语" : `编辑 #${editing.id}`}
            </h2>
            <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => setEditing(null)} aria-label="关闭编辑">
              <X className="size-4" />
            </Button>
          </div>
          <form onSubmit={submitQuote} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="daily-quote-text">提醒语</Label>
              <Textarea
                id="daily-quote-text"
                value={draft.quote}
                onChange={(event) => setDraft((current) => ({ ...current, quote: event.target.value }))}
                maxLength={500}
                required
                className="min-h-24"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="daily-quote-category">分类</Label>
                <Input
                  id="daily-quote-category"
                  list="daily-quote-categories"
                  value={draft.category}
                  onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                  maxLength={32}
                  required
                  className="h-11"
                />
                <datalist id="daily-quote-categories">
                  {data.categories.map((category) => <option key={category} value={category} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-quote-author">作者</Label>
                <Input id="daily-quote-author" value={draft.author} onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))} maxLength={120} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-quote-source">来源</Label>
                <Input id="daily-quote-source" value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} maxLength={200} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-quote-detail">来源说明</Label>
                <Input id="daily-quote-detail" value={draft.sourceDetail} onChange={(event) => setDraft((current) => ({ ...current, sourceDetail: event.target.value }))} maxLength={200} className="h-11" />
              </div>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.checked }))}
                  className="size-4 accent-primary"
                />
                启用
              </label>
              {assignedDisable && (
                <div className="w-full max-w-xl space-y-2">
                  <Label htmlFor="daily-quote-replacement">接替 {editing.assignedDate} 的提醒语</Label>
                  <select
                    id="daily-quote-replacement"
                    value={draft.replacementQuoteId}
                    onChange={(event) => setDraft((current) => ({ ...current, replacementQuoteId: event.target.value }))}
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                    required
                  >
                    <option value="">选择未分配提醒语</option>
                    {data.replacements.map((item) => <option key={item.id} value={item.id}>{item.quote}</option>)}
                  </select>
                </div>
              )}
              <Button type="submit" className="h-11 px-5" disabled={pending || !draft.quote.trim() || !draft.category.trim()}>
                {pending ? "保存中" : "保存"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {deleteTarget && (
        <section className="border-b border-destructive/30 py-6" aria-labelledby="delete-quote-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h2 id="delete-quote-title" className="font-semibold text-destructive">删除提醒语 #{deleteTarget.id}</h2>
              <p className="mt-2 break-words text-sm text-muted-foreground">{deleteTarget.quote}</p>
            </div>
            {deleteTarget.assignedDate && (
              <div className="w-full max-w-lg space-y-2">
                <Label htmlFor="delete-quote-replacement">接替 {deleteTarget.assignedDate} 的提醒语</Label>
                <select
                  id="delete-quote-replacement"
                  value={deleteReplacementId}
                  onChange={(event) => setDeleteReplacementId(event.target.value)}
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">选择未分配提醒语</option>
                  {data.replacements.map((item) => <option key={item.id} value={item.id}>{item.quote}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button type="button" variant="destructive" className="h-11" disabled={pending || Boolean(deleteTarget.assignedDate && !deleteReplacementId)} onClick={() => void confirmDelete()}>
                确认删除
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="py-6" aria-label="提醒语筛选">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={applySearch} className="flex w-full max-w-xl gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索内容、分类、作者或来源" maxLength={100} className="h-11 pl-9" />
            </div>
            <Button type="submit" variant="outline" className="h-11 px-4" disabled={pending}>搜索</Button>
          </form>
          <div className="inline-flex w-fit rounded-md border border-border p-0.5" aria-label="状态筛选">
            {([['all', '全部'], ['active', '启用'], ['inactive', '停用']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => applyStatus(value)}
                aria-pressed={status === value}
                className={cn(
                  "h-10 rounded px-4 text-sm transition-colors",
                  status === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      </section>

      <div className={cn("divide-y divide-border rounded-lg border border-border/70", pending && "opacity-70")}>
        {data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">没有符合条件的提醒语</p>
        ) : data.items.map((item) => (
          <article key={item.id} className="grid min-w-0 gap-4 p-4 md:grid-cols-[5rem_minmax(0,1fr)_8rem_5.5rem] md:items-center">
            <div className="flex items-center gap-2 md:block">
              <span className="text-xs text-muted-foreground">#{item.id}</span>
              <p className="mt-0 md:mt-1 text-sm font-medium tabular-nums">{item.assignedDate ?? "未分配"}</p>
            </div>
            <div className="min-w-0">
              <p className="break-words leading-6">{item.quote}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.category}{item.author ? ` · ${item.author}` : ""}{item.source ? ` · ${item.source}` : ""}
              </p>
            </div>
            <span className={cn("text-sm", item.status ? "text-foreground" : "text-muted-foreground")}>
              {item.status ? "启用" : "停用"}
            </span>
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => beginEdit(item)} aria-label={`编辑提醒语 ${item.id}`} title="编辑">
                <Pencil className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-11 text-destructive" onClick={() => { setDeleteTarget(item); setDeleteReplacementId(""); setEditing(null); setError("") }} aria-label={`删除提醒语 ${item.id}`} title="删除">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </div>

      <footer className="flex items-center justify-between gap-4 py-6">
        <p className="text-sm text-muted-foreground">第 {data.page} / {data.totalPages} 页</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="icon" className="size-11" disabled={pending || data.page <= 1} onClick={() => void load({ page: data.page - 1 })} aria-label="上一页">
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-11" disabled={pending || data.page >= data.totalPages} onClick={() => void load({ page: data.page + 1 })} aria-label="下一页">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  )
}
