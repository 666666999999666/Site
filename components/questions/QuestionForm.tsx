"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, LoaderCircle, Power, PowerOff, Save, ShieldCheck } from "lucide-react"
import { QuestionAttemptList, QuestionTimeline } from "@/components/questions/QuestionAttemptList"
import { questionApiRequest, questionErrorMessage, questionJsonRequest } from "@/components/questions/api"
import { QuestionMarkdownEditor } from "@/components/questions/QuestionMarkdownEditor"
import {
  type Paginated,
  type QuestionDetail,
  type QuestionDetailResponse,
  type QuestionTimelineItem,
} from "@/components/questions/types"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SchedulePolicy = "KEEP" | "RESET"

function normalizedReference(value: string): string | null {
  return value.trim() ? value : null
}

function validLength(value: string) {
  return Array.from(value).length <= 100_000
}

export function QuestionForm({ mode, questionId }: { mode: "create" | "edit"; questionId?: string }) {
  const router = useRouter()
  const [question, setQuestion] = useState<QuestionDetail | null>(null)
  const [promptMarkdown, setPromptMarkdown] = useState("")
  const [referenceAnswerMarkdown, setReferenceAnswerMarkdown] = useState("")
  const [attempts, setAttempts] = useState<QuestionDetailResponse["attempts"]>([])
  const [timeline, setTimeline] = useState<Paginated<QuestionTimelineItem>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
  const [schedulePolicy, setSchedulePolicy] = useState<SchedulePolicy | null>(null)
  const [loading, setLoading] = useState(mode === "edit")
  const [saving, setSaving] = useState(false)
  const [changingEnabled, setChangingEnabled] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [promptError, setPromptError] = useState("")
  const [answerError, setAnswerError] = useState("")

  const loadQuestion = useCallback(async () => {
    if (!questionId) return
    try {
      const response = await questionApiRequest<QuestionDetailResponse>(`/api/questions/${encodeURIComponent(questionId)}`)
      setQuestion(response.question)
      setPromptMarkdown(response.question.promptMarkdown)
      setReferenceAnswerMarkdown(response.question.referenceAnswerMarkdown ?? "")
      setAttempts(response.attempts)
      setTimeline(response.timeline)
      setSchedulePolicy(null)
    } catch (caught) {
      setError(questionErrorMessage(caught, "题目加载失败"))
    } finally {
      setLoading(false)
    }
  }, [questionId])

  useEffect(() => {
    if (!questionId) return
    let cancelled = false
    void questionApiRequest<QuestionDetailResponse>(`/api/questions/${encodeURIComponent(questionId)}`)
      .then((response) => {
        if (cancelled) return
        setQuestion(response.question)
        setPromptMarkdown(response.question.promptMarkdown)
        setReferenceAnswerMarkdown(response.question.referenceAnswerMarkdown ?? "")
        setAttempts(response.attempts)
        setTimeline(response.timeline)
        setSchedulePolicy(null)
      })
      .catch((caught) => {
        if (!cancelled) setError(questionErrorMessage(caught, "题目加载失败"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [questionId])

  const nextReference = normalizedReference(referenceAnswerMarkdown)
  const requiresPolicy = mode === "edit"
    && question?.referenceAnswerMarkdown !== null
    && Boolean(nextReference)
  const dirty = useMemo(() => {
    if (mode === "create") return Boolean(promptMarkdown || referenceAnswerMarkdown)
    if (!question) return false
    return promptMarkdown !== question.promptMarkdown
      || nextReference !== question.referenceAnswerMarkdown
  }, [mode, nextReference, promptMarkdown, question, referenceAnswerMarkdown])

  function validate() {
    const nextPromptError = !promptMarkdown.trim()
      ? "题目必填"
      : !validLength(promptMarkdown)
        ? "题目不能超过 100000 个字符"
        : ""
    const nextAnswerError = !validLength(referenceAnswerMarkdown)
      ? "标准答案不能超过 100000 个字符"
      : ""
    setPromptError(nextPromptError)
    setAnswerError(nextAnswerError)
    if (nextPromptError || nextAnswerError) return false
    if (requiresPolicy && !schedulePolicy) {
      setError("请先选择保留当前排程或重置为新题")
      return false
    }
    return true
  }

  async function saveQuestion() {
    setMessage("")
    setError("")
    if (!validate()) return

    setSaving(true)
    try {
      if (mode === "create") {
        const response = await questionApiRequest<{ question?: { id: string }; id?: string }>("/api/questions", {
          ...questionJsonRequest("POST", {
            promptMarkdown,
            referenceAnswerMarkdown: nextReference,
          }),
        })
        const id = response.question?.id ?? response.id
        router.push(id ? `/admin/questions/${encodeURIComponent(id)}` : "/admin/questions")
        router.refresh()
        return
      }

      if (!questionId || !question) return
      await questionApiRequest(`/api/questions/${encodeURIComponent(questionId)}`, {
        ...questionJsonRequest("PATCH", {
          operation: "EDIT_CONTENT",
          promptMarkdown,
          referenceAnswerMarkdown: nextReference,
          schedulePolicy: requiresPolicy ? schedulePolicy : null,
          expectedContentVersion: question.contentVersion,
          expectedScheduleVersion: question.scheduleVersion,
        }),
      })
      await loadQuestion()
      setMessage("题目已保存")
    } catch (caught) {
      setError(questionErrorMessage(caught, "保存失败"))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled() {
    if (!questionId || !question) return
    setChangingEnabled(true)
    setError("")
    setMessage("")
    try {
      await questionApiRequest(`/api/questions/${encodeURIComponent(questionId)}`, {
        ...questionJsonRequest("PATCH", {
          operation: "SET_ENABLED",
          enabled: !question.enabled,
        }),
      })
      await loadQuestion()
      setMessage(question.enabled ? "题目已停用，排程仍保留" : "题目已启用，已恢复原排程")
    } catch (caught) {
      setError(questionErrorMessage(caught, "状态修改失败"))
    } finally {
      setChangingEnabled(false)
    }
  }

  async function loadTimelinePage(page: number) {
    if (!questionId || page < 1) return
    setError("")
    try {
      const response = await questionApiRequest<Paginated<QuestionTimelineItem> | { timeline: Paginated<QuestionTimelineItem> }>(
        `/api/questions/${encodeURIComponent(questionId)}/history?page=${page}`
      )
      setTimeline("timeline" in response ? response.timeline : response)
    } catch (caught) {
      setError(questionErrorMessage(caught, "时间线加载失败"))
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground" role="status">
        <LoaderCircle className="mr-2 size-5 animate-spin" /> 正在加载题目
      </div>
    )
  }

  if (mode === "edit" && !question) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>无法打开题目</CardTitle>
          <CardDescription>{error || "题目不存在或当前账号无权访问。"}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/questions" className={buttonVariants({ variant: "outline" })}>返回问题中学</Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/questions" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> 返回问题中学
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{mode === "create" ? "新建题目" : "编辑题目"}</h1>
            {question && (
              <Badge variant={question.enabled ? (question.ready ? "secondary" : "outline") : "destructive"}>
                {!question.enabled ? "已停用" : question.ready ? "可复习" : "待补答案"}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            标准答案由你本人填写；非空保存即视为已审核。
          </p>
        </div>
        {question && (
          <Button
            type="button"
            variant={question.enabled ? "destructive" : "outline"}
            disabled={changingEnabled}
            onClick={() => void toggleEnabled()}
          >
            {changingEnabled ? <LoaderCircle className="animate-spin" /> : question.enabled ? <PowerOff /> : <Power />}
            {question.enabled ? "停用题目" : "启用题目"}
          </Button>
        )}
      </header>

      <form
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault()
          void saveQuestion()
        }}
      >
        <QuestionMarkdownEditor
          id="question-prompt"
          label="题目"
          value={promptMarkdown}
          onChange={(value) => {
            setPromptMarkdown(value)
            setPromptError("")
            setMessage("")
          }}
          placeholder="输入题目，支持 Markdown……"
          required
          error={promptError}
        />

        <QuestionMarkdownEditor
          id="question-reference-answer"
          label="标准答案（可选）"
          value={referenceAnswerMarkdown}
          onChange={(value) => {
            setReferenceAnswerMarkdown(value)
            setAnswerError("")
            setSchedulePolicy(null)
            setMessage("")
          }}
          placeholder="留空则保存为待补答案，不进入复习队列……"
          error={answerError}
          description="答案非空即视为你已审核；清空答案会退出复习队列并重置排程。"
        />

        {requiresPolicy && dirty && (
          <fieldset className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
            <legend className="px-1 font-medium">这次修改如何处理排程？</legend>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              当前题目和保存后的题目都可复习，必须明确选择一次。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors",
                schedulePolicy === "KEEP" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"
              )}>
                <input
                  type="radio"
                  name="schedule-policy"
                  value="KEEP"
                  checked={schedulePolicy === "KEEP"}
                  onChange={() => setSchedulePolicy("KEEP")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">保留当前排程</span>
                  <span className="mt-1 block text-sm text-muted-foreground">继续沿用已有记忆状态和到期时间。</span>
                </span>
              </label>
              <label className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors",
                schedulePolicy === "RESET" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"
              )}>
                <input
                  type="radio"
                  name="schedule-policy"
                  value="RESET"
                  checked={schedulePolicy === "RESET"}
                  onChange={() => setSchedulePolicy("RESET")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">重置为新题</span>
                  <span className="mt-1 block text-sm text-muted-foreground">清空当前排程，从新题开始学习。</span>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-6 text-sm">
            {error && <p className="text-destructive" role="alert">{error}</p>}
            {!error && message && <p className="text-primary" role="status">{message}</p>}
            {!error && !message && mode === "edit" && !dirty && <p className="text-muted-foreground">当前没有未保存修改。</p>}
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-11 px-5"
            disabled={saving || (mode === "edit" && !dirty)}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : mode === "create" ? <ShieldCheck /> : <Save />}
            {saving ? "保存中" : mode === "create" ? "保存题目" : "保存修改"}
          </Button>
        </div>
      </form>

      {question && (
        <div className="grid gap-6 border-t border-border/60 pt-8 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>最近两次作答</CardTitle>
              <CardDescription>答案正文永久只保留最近两条 typed 作答。</CardDescription>
            </CardHeader>
            <CardContent>
              <QuestionAttemptList attempts={attempts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>完整时间线</CardTitle>
              <CardDescription>评分与排程元数据永久保留，每页 {timeline.pageSize} 条。</CardDescription>
            </CardHeader>
            <CardContent>
              <QuestionTimeline items={timeline.items} />
              {timeline.total > timeline.pageSize && (
                <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={timeline.page <= 1}
                    onClick={() => void loadTimelinePage(timeline.page - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    第 {timeline.page} / {Math.max(1, Math.ceil(timeline.total / timeline.pageSize))} 页
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={timeline.page * timeline.pageSize >= timeline.total}
                    onClick={() => void loadTimelinePage(timeline.page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
