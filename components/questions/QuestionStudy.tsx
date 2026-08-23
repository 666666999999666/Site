"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings2,
} from "lucide-react"
import { QuestionAttemptList } from "@/components/questions/QuestionAttemptList"
import {
  QuestionApiError,
  questionApiRequest,
  questionErrorMessage,
  questionJsonRequest,
} from "@/components/questions/api"
import { QuestionMarkdown } from "@/components/questions/QuestionMarkdown"
import { QuestionMarkdownEditor } from "@/components/questions/QuestionMarkdownEditor"
import {
  formatQuestionTime,
  ratingDescriptions,
  ratingLabels,
  type QuestionPreferences,
  type QuestionRating,
  type RatingResponse,
  type RevealResponse,
  type TodayQuestion,
  type TodayResponse,
  type TodayTransitionResponse,
} from "@/components/questions/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type CurrentReview = {
  question: TodayQuestion
  answerMarkdown: string
  revealed: RevealResponse | null
  directReveal: boolean
  rating: QuestionRating | null
  reviewRevision: number | null
}

type CompletedReview = {
  key: string
  promptMarkdown: string
  answerMarkdown: string
  revealed: RevealResponse
  directReveal: boolean
  rating: QuestionRating
}

const ratings: QuestionRating[] = ["AGAIN", "HARD", "GOOD", "EASY"]

function queueMessage(today: TodayResponse | null) {
  if (!today) return "正在读取今日队列"
  if (today.summary.dueOldCount > 0) return `到期旧题 ${today.summary.dueOldCount} 道`
  if (today.state === "READY" && today.summary.newRemaining > 0) {
    return `可学习新题 · 剩余额度 ${today.summary.newRemaining}`
  }
  if (today.state === "WAITING") return `暂时完成 · ${formatQuestionTime(today.nextDueAt, false)} 后还有复习`
  return "今日已完成"
}

function bestEffortAdvance(reviewKey: string) {
  void fetch(`/api/questions/reviews/${encodeURIComponent(reviewKey)}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    keepalive: true,
  }).catch(() => undefined)
}

export function QuestionStudy() {
  const [today, setToday] = useState<TodayResponse | null>(null)
  const [current, setCurrent] = useState<CurrentReview | null>(null)
  const currentRef = useRef<CurrentReview | null>(null)
  const [completed, setCompleted] = useState<CompletedReview[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [starting, setStarting] = useState(true)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [limitDraft, setLimitDraft] = useState("10")
  const [savingLimit, setSavingLimit] = useState(false)
  const startRequested = useRef(false)
  const summaryRequestRevision = useRef(0)
  const questionRegionRef = useRef<HTMLElement | null>(null)
  const revealedRegionRef = useRef<HTMLDivElement | null>(null)
  const pendingFocusRef = useRef<"question" | "revealed" | null>(null)

  function replaceCurrent(next: CurrentReview | null) {
    currentRef.current = next
    setCurrent(next)
  }

  const applyTransition = useCallback((response: TodayTransitionResponse) => {
    summaryRequestRevision.current += 1
    setToday({
      summary: response.summary,
      preferences: response.preferences,
      state: response.state,
      nextDueAt: response.nextDueAt,
    })
    setLimitDraft(String(response.preferences.dailyNewLimit))
    if (response.state === "READY" && response.question) {
      const next: CurrentReview = {
        question: response.question,
        answerMarkdown: "",
        revealed: null,
        directReveal: false,
        rating: null,
        reviewRevision: null,
      }
      currentRef.current = next
      setCurrent(next)
    } else {
      currentRef.current = null
      setCurrent(null)
    }
    setHistoryIndex(null)
  }, [])

  const startSession = useCallback(async (resyncMessage?: string, focusQuestion = false) => {
    setStarting(true)
    setError("")
    setNotice(resyncMessage ?? "")
    try {
      const response = await questionApiRequest<TodayTransitionResponse>("/api/questions/today/start", {
        ...questionJsonRequest("POST", {}),
      })
      if (focusQuestion) pendingFocusRef.current = "question"
      applyTransition(response)
    } catch (caught) {
      setError(questionErrorMessage(caught, "今日复习加载失败"))
    } finally {
      setStarting(false)
    }
  }, [applyTransition])

  useEffect(() => {
    if (startRequested.current) return
    startRequested.current = true
    void startSession()
  }, [startSession])

  useEffect(() => {
    const target = pendingFocusRef.current
    if (!target) return
    pendingFocusRef.current = null
    const frame = requestAnimationFrame(() => {
      if (target === "revealed") revealedRegionRef.current?.focus()
      else questionRegionRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [current?.question.reviewKey, current?.revealed])

  useEffect(() => {
    const handlePageHide = () => {
      const active = currentRef.current
      if (active) bestEffortAdvance(active.question.reviewKey)
    }
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      const active = currentRef.current
      if (active) bestEffortAdvance(active.question.reviewKey)
    }
  }, [])

  async function refreshSummary() {
    const revision = summaryRequestRevision.current + 1
    summaryRequestRevision.current = revision
    try {
      const response = await questionApiRequest<TodayResponse>("/api/questions/today")
      if (revision !== summaryRequestRevision.current) return
      setToday(response)
      setLimitDraft(String(response.preferences.dailyNewLimit))
    } catch {
      // The review action itself already succeeded. A stale summary is safer than
      // replacing that success with a secondary refresh error.
    }
  }

  async function recoverFromActionError(caught: unknown) {
    if (caught instanceof QuestionApiError && (caught.status === 409 || caught.code === "RESYNC_REQUIRED")) {
      replaceCurrent(null)
      await startSession("题目状态已变化，已重新同步今日队列。", true)
      return
    }
    setError(questionErrorMessage(caught))
  }

  async function revealAnswer() {
    if (!current || current.revealed) return
    setActing(true)
    setError("")
    setNotice("")
    try {
      const response = await questionApiRequest<RevealResponse>(
        `/api/questions/reviews/${encodeURIComponent(current.question.reviewKey)}/reveal`,
        {
          ...questionJsonRequest("POST", {
            answerMarkdown: current.answerMarkdown,
            expectedContentVersion: current.question.contentVersion,
            expectedScheduleVersion: current.question.scheduleVersion,
          }),
        }
      )
      const directReveal = response.directReveal ?? !current.answerMarkdown.trim()
      const next: CurrentReview = {
        ...current,
        revealed: response,
        directReveal,
        rating: directReveal ? response.rating ?? "AGAIN" : null,
        reviewRevision: directReveal ? response.reviewRevision ?? null : null,
      }
      pendingFocusRef.current = "revealed"
      replaceCurrent(next)
      if (directReveal) void refreshSummary()
    } catch (caught) {
      await recoverFromActionError(caught)
    } finally {
      setActing(false)
    }
  }

  async function saveRating(rating: QuestionRating) {
    if (!current?.revealed || current.directReveal) return
    setActing(true)
    setError("")
    setNotice("")
    try {
      const request = current.reviewRevision === null
        ? {
            operation: "CREATE" as const,
            answerMarkdown: current.answerMarkdown,
            rating,
            expectedContentVersion: current.question.contentVersion,
            expectedScheduleVersion: current.question.scheduleVersion,
          }
        : {
            operation: "REVISE" as const,
            rating,
            expectedReviewRevision: current.reviewRevision,
          }
      const response = await questionApiRequest<RatingResponse>(
        `/api/questions/reviews/${encodeURIComponent(current.question.reviewKey)}/rating`,
        { ...questionJsonRequest("PUT", request) }
      )
      replaceCurrent({
        ...current,
        rating: response.rating ?? rating,
        reviewRevision: response.reviewRevision,
      })
      setNotice(current.reviewRevision === null ? "评分已保存；点击下一题前仍可改档。" : "评分已更新。")
      void refreshSummary()
    } catch (caught) {
      await recoverFromActionError(caught)
    } finally {
      setActing(false)
    }
  }

  async function advance() {
    if (!current?.revealed || !current.rating) return
    setActing(true)
    setError("")
    setNotice("")
    try {
      const response = await questionApiRequest<TodayTransitionResponse>(
        `/api/questions/reviews/${encodeURIComponent(current.question.reviewKey)}/advance`,
        { ...questionJsonRequest("POST", {}) }
      )
      const finished: CompletedReview = {
        key: current.question.reviewKey,
        promptMarkdown: current.question.promptMarkdown,
        answerMarkdown: current.answerMarkdown,
        revealed: current.revealed,
        directReveal: current.directReveal,
        rating: current.rating,
      }
      setCompleted((items) => [...items, finished])
      pendingFocusRef.current = "question"
      applyTransition(response)
    } catch (caught) {
      await recoverFromActionError(caught)
    } finally {
      setActing(false)
    }
  }

  async function saveDailyLimit() {
    const dailyNewLimit = Number(limitDraft)
    if (!Number.isInteger(dailyNewLimit) || dailyNewLimit < 1 || dailyNewLimit > 100) {
      setError("每日新题上限必须是 1–100 的整数")
      return
    }
    setSavingLimit(true)
    setError("")
    setNotice("")
    try {
      const response = await questionApiRequest<QuestionPreferences | { preferences: QuestionPreferences }>(
        "/api/questions/preferences",
        { ...questionJsonRequest("PATCH", { dailyNewLimit }) }
      )
      const preferences = "preferences" in response ? response.preferences : response
      setToday((value) => value ? { ...value, preferences } : value)
      setLimitDraft(String(preferences.dailyNewLimit))
      setNotice("每日新题上限已保存，从当前队列重新计算。")
      void refreshSummary()
    } catch (caught) {
      setError(questionErrorMessage(caught, "设置保存失败"))
    } finally {
      setSavingLimit(false)
    }
  }

  const viewed = historyIndex === null ? null : completed[historyIndex]
  const canViewPrevious = completed.length > 0 && historyIndex !== 0
  const nextHistoryLabel = historyIndex !== null && historyIndex < completed.length - 1
    ? "下一条已完成"
    : "回到当前题"

  return (
    <div className="space-y-6">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {starting
          ? "正在同步今日复习队列"
          : current?.revealed
            ? "标准答案已揭晓，请完成评分后进入下一题"
            : current
              ? "已进入新的复习题目"
              : queueMessage(today)}
      </p>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="size-5" /> 今日复习
              </CardTitle>
              <CardDescription className="mt-1">只处理今天应学的题目；旧到期题始终优先。</CardDescription>
            </div>
            <Badge variant={current ? "default" : "outline"} className="h-7 px-3">
              {starting ? "同步队列中" : queueMessage(today)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-background p-4">
              <p className="text-xs text-muted-foreground">今日动作</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{today?.summary.totalActions ?? 0}</p>
            </div>
            <div className="bg-background p-4">
              <p className="text-xs text-muted-foreground">不同题目</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{today?.summary.uniqueQuestions ?? 0}</p>
            </div>
            <div className="bg-background p-4">
              <p className="text-xs text-muted-foreground">作答 / 直接揭晓</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {today?.summary.typedCount ?? 0} / {today?.summary.directRevealCount ?? 0}
              </p>
            </div>
            <div className="bg-background p-4">
              <p className="text-xs text-muted-foreground">已引入新题 / 剩余额度</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {today?.summary.newIntroducedToday ?? 0} / {today?.summary.newRemaining ?? 0}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="今日评分分布">
              {ratings.map((rating) => (
                <Badge key={rating} variant="outline" className="h-7 px-3">
                  {ratingLabels[rating]} {today?.summary.ratings[rating] ?? 0}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <label className="space-y-1 text-xs text-muted-foreground" htmlFor="daily-new-limit">
                <span className="flex items-center gap-1"><Settings2 className="size-3.5" /> 每日新题上限</span>
                <Input
                  id="daily-new-limit"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={limitDraft}
                  onChange={(event) => setLimitDraft(event.target.value)}
                  className="h-9 w-28 bg-background text-foreground"
                />
              </label>
              <Button type="button" variant="outline" className="h-9" disabled={savingLimit} onClick={() => void saveDailyLimit()}>
                {savingLimit ? <LoaderCircle className="animate-spin" /> : <Save />}
                保存
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      {!error && notice && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-foreground" role="status">
          {notice}
        </div>
      )}

      {starting && !current ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-border/70 text-muted-foreground" role="status">
          <LoaderCircle className="mr-2 size-5 animate-spin" /> 正在进入今日复习
        </div>
      ) : viewed ? (
        <ReviewDisplay review={viewed} />
      ) : current ? (
        <Card className="overflow-visible">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>当前题目</CardTitle>
                <CardDescription className="mt-1">
                  {current.revealed ? "答案已揭晓，本题正文已锁定。" : "先独立作答，再对照你审核过的标准答案。"}
                </CardDescription>
              </div>
              <Badge variant="outline">{completed.length + 1}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <section
              ref={questionRegionRef}
              tabIndex={-1}
              className="focus:outline-none"
              aria-labelledby="current-question-heading"
            >
              <h3 id="current-question-heading" className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                题目
              </h3>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-5 sm:p-6">
                <QuestionMarkdown markdown={current.question.promptMarkdown} />
              </div>
            </section>

            {!current.revealed ? (
              <>
                <QuestionMarkdownEditor
                  id="my-answer"
                  label="我的答案"
                  value={current.answerMarkdown}
                  onChange={(answerMarkdown) => replaceCurrent({ ...current, answerMarkdown })}
                  allowImages={false}
                  minRowsClassName="min-h-44"
                  placeholder="闭卷写下你的答案；也可以留空直接揭晓……"
                  description="答案仅在揭晓后评分成功时保存；未评分离开不会保存正文。"
                />
                <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {current.answerMarkdown.trim()
                      ? "揭晓后答案正文会锁定，再由你自评。"
                      : "空白揭晓会自动记为不可改的“重来”，且不保存答案正文。"}
                  </p>
                  <Button type="button" size="lg" className="h-11 px-5" disabled={acting} onClick={() => void revealAnswer()}>
                    {acting ? <LoaderCircle className="animate-spin" /> : <Eye />}
                    {current.answerMarkdown.trim() ? "对照标准答案" : "直接揭晓"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div
                  ref={revealedRegionRef}
                  tabIndex={-1}
                  role="region"
                  aria-label="已揭晓的答案"
                  className="focus:outline-none"
                >
                  <RevealedAnswer review={{
                    key: current.question.reviewKey,
                    promptMarkdown: current.question.promptMarkdown,
                    answerMarkdown: current.answerMarkdown,
                    revealed: current.revealed,
                    directReveal: current.directReveal,
                    rating: current.rating ?? "AGAIN",
                  }} />
                </div>

                {current.directReveal ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                    <p className="font-medium">已自动记为“重来”</p>
                    <p className="mt-1 text-sm text-muted-foreground">直接揭晓不保存答案正文，也不能改档。</p>
                  </div>
                ) : (
                  <fieldset className="space-y-3">
                    <legend className="font-medium">这次回忆得怎么样？</legend>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {ratings.map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          disabled={acting}
                          aria-pressed={current.rating === rating}
                          onClick={() => void saveRating(rating)}
                          className={cn(
                            "rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                            current.rating === rating
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background hover:border-primary/50 hover:bg-muted/30"
                          )}
                        >
                          <span className="block font-medium">{ratingLabels[rating]}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{ratingDescriptions[rating]}</span>
                        </button>
                      ))}
                    </div>
                    {current.rating && (
                      <p className="text-sm text-muted-foreground">
                        当前评分：<span className="font-medium text-foreground">{ratingLabels[current.rating]}</span>。点击下一题前可直接选择其他档位。
                      </p>
                    )}
                  </fieldset>
                )}

                <div className="flex justify-end border-t border-border/60 pt-5">
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 px-5"
                    disabled={acting || !current.rating}
                    onClick={() => void advance()}
                  >
                    {acting ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                    下一题
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            {!today
              ? <RefreshCw className="size-9 text-destructive" />
              : today.state === "WAITING"
                ? <Clock3 className="size-9 text-primary" />
                : <CheckCircle2 className="size-9 text-primary" />}
            <h2 className="mt-4 text-xl font-semibold">
              {!today ? "无法读取今日队列" : today.state === "WAITING" ? "暂时完成" : "今日已完成"}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {!today
                ? "请检查网络或服务状态后重试。"
                : today.state === "WAITING"
                ? `${formatQuestionTime(today.nextDueAt, false)} 后还有一轮短期复习；未来题目不会阻挡仍可引入的新题。`
                : "当前没有到期旧题，也没有可引入的新题。"}
            </p>
            <Button type="button" variant="outline" className="mt-5" disabled={starting} onClick={() => void startSession()}>
              {starting ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              重新检查队列
            </Button>
          </CardContent>
        </Card>
      )}

      {(completed.length > 0 || historyIndex !== null) && (
        <nav className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between" aria-label="本页已完成题目">
          <Button
            type="button"
            variant="outline"
            disabled={!canViewPrevious}
            onClick={() => setHistoryIndex((index) => index === null ? completed.length - 1 : Math.max(0, index - 1))}
          >
            <ArrowLeft /> 上一条已完成
          </Button>
          <span className="text-center text-xs text-muted-foreground">
            {historyIndex === null ? "当前题可操作；历史题只读" : `正在查看本页第 ${historyIndex + 1} 条已完成记录`}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={historyIndex === null}
            onClick={() => {
              if (historyIndex === null) return
              setHistoryIndex(historyIndex < completed.length - 1 ? historyIndex + 1 : null)
            }}
          >
            {nextHistoryLabel} <ArrowRight />
          </Button>
        </nav>
      )}
    </div>
  )
}

function RevealedAnswer({ review }: { review: CompletedReview }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-border/70 bg-muted/20 p-5" aria-labelledby={`${review.key}-my-answer`}>
        <h3 id={`${review.key}-my-answer`} className="mb-4 text-sm font-medium">我的答案</h3>
        {review.answerMarkdown.trim() ? (
          <QuestionMarkdown markdown={review.answerMarkdown} />
        ) : (
          <p className="text-sm text-muted-foreground">本题为直接揭晓，没有保存答案正文。</p>
        )}
      </section>
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5" aria-labelledby={`${review.key}-reference-answer`}>
        <h3 id={`${review.key}-reference-answer`} className="mb-4 text-sm font-medium">标准答案</h3>
        <QuestionMarkdown markdown={review.revealed.referenceAnswerMarkdown} />
      </section>
      <section className="xl:col-span-2" aria-labelledby={`${review.key}-recent-attempts`}>
        <h3 id={`${review.key}-recent-attempts`} className="mb-3 text-sm font-medium">最近两次作答</h3>
        <QuestionAttemptList attempts={review.revealed.attempts} />
      </section>
    </div>
  )
}

function ReviewDisplay({ review }: { review: CompletedReview }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>已完成 · 只读</CardTitle>
            <CardDescription className="mt-1">这是当前页面内的临时回看记录，刷新后会消失。</CardDescription>
          </div>
          <Badge variant="secondary">{ratingLabels[review.rating]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">题目</h3>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-5 sm:p-6">
            <QuestionMarkdown markdown={review.promptMarkdown} />
          </div>
        </section>
        <RevealedAnswer review={review} />
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm">
          <CheckCircle2 className="size-5 text-primary" />
          最终评分：<span className="font-medium">{ratingLabels[review.rating]}</span>
          {review.directReveal && <span className="text-muted-foreground">（直接揭晓）</span>}
        </div>
      </CardContent>
    </Card>
  )
}
