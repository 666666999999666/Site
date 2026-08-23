"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Archive, ArchiveRestore, Clock3, LoaderCircle, Pencil, Plus, Search } from "lucide-react"
import { questionApiRequest, questionErrorMessage, questionJsonRequest } from "@/components/questions/api"
import {
  dueLabel,
  formatQuestionDateTime,
  markdownSummary,
  ratingLabels,
  stateLabel,
  type QuestionListResponse,
} from "@/components/questions/types"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const emptyResponse: QuestionListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pendingCount: 0,
}

export function QuestionLibrary() {
  const [draftQuery, setDraftQuery] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [rating, setRating] = useState("")
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [response, setResponse] = useState<QuestionListResponse>(emptyResponse)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [changingId, setChangingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page) })
    if (query) params.set("q", query)
    if (status) params.set("status", status)
    if (rating) params.set("rating", rating)

    void questionApiRequest<QuestionListResponse>(`/api/questions?${params.toString()}`)
      .then((next) => {
        if (!cancelled) {
          setResponse(next)
          setError("")
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(questionErrorMessage(caught, "题库加载失败"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [page, query, rating, refreshKey, status])

  function updateFilter(update: () => void) {
    setLoading(true)
    setError("")
    setPage(1)
    update()
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setChangingId(id)
    setError("")
    try {
      await questionApiRequest(`/api/questions/${encodeURIComponent(id)}`, {
        ...questionJsonRequest("PATCH", { operation: "SET_ENABLED", enabled: !enabled }),
      })
      setLoading(true)
      setRefreshKey((current) => current + 1)
    } catch (caught) {
      setError(questionErrorMessage(caught, "题目状态修改失败"))
    } finally {
      setChangingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(response.total / response.pageSize))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>题库管理</CardTitle>
              <CardDescription className="mt-1">
                默认显示已启用且答案就绪的题目；列表不会展示标准答案。
              </CardDescription>
            </div>
            <Link href="/admin/questions/new" className={cn(buttonVariants(), "h-9 gap-1.5 px-3")}>
              <Plus className="size-4" /> 新建题目
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_12rem_12rem_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              updateFilter(() => setQuery(draftQuery.trim()))
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draftQuery}
                maxLength={200}
                onChange={(event) => setDraftQuery(event.target.value)}
                className="h-10 pl-9"
                placeholder="搜索题目或当前标准答案"
                aria-label="搜索题库"
              />
            </div>
            <select
              value={status}
              onChange={(event) => updateFilter(() => setStatus(event.target.value))}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
              aria-label="按题目状态筛选"
            >
              <option value="">可复习（默认）</option>
              <option value="READY">全部就绪</option>
              <option value="DUE">已到期</option>
              <option value="FUTURE">稍后到期</option>
              <option value="NEW">新题</option>
              <option value="PENDING">待补答案</option>
              <option value="DISABLED">已停用</option>
            </select>
            <select
              value={rating}
              onChange={(event) => updateFilter(() => setRating(event.target.value))}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
              aria-label="按最近评分筛选"
            >
              <option value="">全部最近评分</option>
              <option value="NONE">尚未评分</option>
              <option value="AGAIN">重来</option>
              <option value="HARD">困难</option>
              <option value="GOOD">良好</option>
              <option value="EASY">简单</option>
            </select>
            <Button type="submit" className="h-10 px-4">
              <Search /> 搜索
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              共 <span className="font-medium tabular-nums text-foreground">{response.total}</span> 道匹配题目
            </p>
            <p>
              待补答案 <span className="font-medium tabular-nums text-foreground">{response.pendingCount}</span> 道
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-border/70 text-muted-foreground" role="status">
          <LoaderCircle className="mr-2 size-5 animate-spin" /> 正在加载题库
        </div>
      ) : response.items.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <p className="text-base font-medium">没有找到匹配的题目</p>
            <p className="mt-2 text-sm text-muted-foreground">可以调整筛选条件，或手工新建一道题。</p>
            <Link href="/admin/questions/new" className={cn(buttonVariants(), "mt-5 gap-1.5")}>
              <Plus className="size-4" /> 新建题目
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" aria-label="题目列表">
          {response.items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant={!item.enabled ? "destructive" : item.ready ? "secondary" : "outline"}>
                      {stateLabel(item)}
                    </Badge>
                    <Badge variant="outline">
                      最近评分：{item.latestRating ? ratingLabels[item.latestRating] : "无"}
                    </Badge>
                  </div>
                  <h3 className="text-base font-medium leading-7 text-foreground">
                    {markdownSummary(item.promptMarkdown)}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-3.5" /> {dueLabel(item)}
                    </span>
                    <span>更新于 {formatQuestionDateTime(item.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    href={`/admin/questions/${encodeURIComponent(item.id)}`}
                    className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
                  >
                    <Pencil className="size-4" /> 编辑
                  </Link>
                  <Button
                    type="button"
                    variant={item.enabled ? "destructive" : "outline"}
                    disabled={changingId === item.id}
                    onClick={() => void toggleEnabled(item.id, item.enabled)}
                  >
                    {changingId === item.id
                      ? <LoaderCircle className="animate-spin" />
                      : item.enabled ? <Archive /> : <ArchiveRestore />}
                    {item.enabled ? "停用" : "启用"}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && response.total > 0 && (
        <nav className="flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-5 sm:flex-row" aria-label="题库分页">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => {
              setLoading(true)
              setPage((current) => current - 1)
            }}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 <span className="tabular-nums text-foreground">{response.page}</span> / {totalPages} 页
            <span className="ml-2">每页 {response.pageSize} 道</span>
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => {
              setLoading(true)
              setPage((current) => current + 1)
            }}
          >
            下一页
          </Button>
        </nav>
      )}
    </div>
  )
}
