"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Archive, ArchiveRestore, Clock3, LoaderCircle, Pencil, Plus, Search } from "lucide-react"
import { questionApiRequest, questionErrorMessage, questionJsonRequest } from "@/components/questions/api"
import {
  dueLabel,
  formatQuestionDateTime,
  markdownSummary,
  ratingLabels,
  questionRatings,
  stateLabel,
  type QuestionListResponse,
} from "@/components/questions/types"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { EMPTY_QUESTION_NAVIGATION, questionEditorURL, questionNewURL, questionPageURL, type QuestionNavigation } from "@/lib/questions/navigation"

const statusOptions = [
  { value: "", label: "可复习（默认）" },
  { value: "READY", label: "全部就绪" },
  { value: "DUE", label: "已到期" },
  { value: "FUTURE", label: "稍后到期" },
  { value: "NEW", label: "新题" },
  { value: "PENDING", label: "待补答案" },
  { value: "DISABLED", label: "已停用" },
]

const ratingOptions = [
  { value: "", label: "全部最近评分" },
  { value: "NONE", label: "尚未评分" },
  ...questionRatings.map((rating) => ({ value: rating, label: ratingLabels[rating] })),
]

const emptyResponse: QuestionListResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pendingCount: 0,
}

export function QuestionLibrary({ navigation, onNavigate }: {
  navigation?: QuestionNavigation
  onNavigate?: (next: QuestionNavigation) => void
} = {}) {
  const [localNavigation, setLocalNavigation] = useState<QuestionNavigation>({ ...EMPTY_QUESTION_NAVIGATION, tab: "library" })
  const current = navigation ?? localNavigation
  const { query, status, rating, page } = current
  const queryInput = useRef<HTMLInputElement>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [response, setResponse] = useState<QuestionListResponse>(emptyResponse)
  const [pending, setLoading] = useState(true)
  const [loadedRequest, setLoadedRequest] = useState("")
  const [error, setError] = useState("")
  const [changingId, setChangingId] = useState<string | null>(null)
  const restoredLocation = useRef("")
  const requestKey = JSON.stringify([page, query, status, rating])
  const loading = pending || loadedRequest !== requestKey
  const listURL = questionPageURL({ ...current, tab: "library" })

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
        if (!cancelled) {
          setLoadedRequest(requestKey)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [page, query, rating, refreshKey, requestKey, status])

  useEffect(() => {
    if (loading || error || window.location.pathname !== "/admin/questions") return
    const location = window.location.pathname + window.location.search + window.location.hash
    if (restoredLocation.current === location) return
    restoredLocation.current = location
    const remembered = window.history.state?.qzQuestionLibraryScroll
    const frame = requestAnimationFrame(() => {
      if (/^#question-[A-Za-z0-9_-]{1,128}$/.test(window.location.hash)) {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" })
      } else if (remembered?.url === listURL && Number.isFinite(remembered.y) && remembered.y >= 0) {
        window.scrollTo(0, remembered.y)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [error, listURL, loading])

  function rememberPosition() {
    if (window.location.pathname !== "/admin/questions") return
    window.history.replaceState({ ...window.history.state, qzQuestionLibraryScroll: { url: listURL, y: window.scrollY } }, "")
  }

  function navigate(next: QuestionNavigation) {
    setLoading(true)
    setError("")
    if (questionPageURL(next) === questionPageURL(current)) setRefreshKey(value => value + 1)
    if (onNavigate) onNavigate(next)
    else setLocalNavigation(next)
  }

  function updateFilter(update: Partial<QuestionNavigation>) {
    navigate({ ...current, ...update, page: 1 })
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
            <Link href={questionNewURL(listURL)} onClick={rememberPosition} className={cn(buttonVariants(), "h-9 gap-1.5 px-3")}>
              <Plus className="size-4" /> 新建题目
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_12rem_12rem_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              updateFilter({ query: queryInput.current?.value.trim() ?? "" })
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                key={query}
                ref={queryInput}
                defaultValue={query}
                maxLength={200}
                className="h-10 pl-9"
                placeholder="搜索题目或当前标准答案"
                aria-label="搜索题库"
              />
            </div>
            <Select
              items={statusOptions}
              value={status}
              onValueChange={(value) => updateFilter({ status: value ?? "" })}
            >
              <SelectTrigger className="w-full bg-background px-3 text-foreground data-[size=default]:h-10" aria-label="按题目状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="min-h-9 px-3 pr-8">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={ratingOptions}
              value={rating}
              onValueChange={(value) => updateFilter({ rating: value ?? "" })}
            >
              <SelectTrigger className="w-full bg-background px-3 text-foreground data-[size=default]:h-10" aria-label="按最近评分筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {ratingOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="min-h-9 px-3 pr-8">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Link href={questionNewURL(listURL)} onClick={rememberPosition} className={cn(buttonVariants(), "mt-5 gap-1.5")}>
              <Plus className="size-4" /> 新建题目
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" aria-label="题目列表">
          {response.items.map((item) => (
            <article key={item.id} id={`question-${item.id}`} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
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
                    href={questionEditorURL(item.id, listURL + `#question-${item.id}`)}
                    onClick={rememberPosition}
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
              navigate({ ...current, page: page - 1 })
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
              navigate({ ...current, page: page + 1 })
            }}
          >
            下一页
          </Button>
        </nav>
      )}
    </div>
  )
}
