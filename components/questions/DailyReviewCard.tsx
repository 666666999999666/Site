"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, BookOpenCheck, Clock3, LoaderCircle } from "lucide-react"
import { questionApiRequest, questionErrorMessage } from "@/components/questions/api"
import { formatQuestionTime, type TodayResponse } from "@/components/questions/types"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function dailyMessage(today: TodayResponse) {
  if (today.summary.dueOldCount > 0) return `到期旧题 ${today.summary.dueOldCount} 道`
  if (today.state === "READY" && today.summary.newRemaining > 0) {
    return `可学习新题 · 剩余额度 ${today.summary.newRemaining}`
  }
  if (today.state === "WAITING") {
    return `暂时完成 · ${formatQuestionTime(today.nextDueAt, false)} 后还有复习`
  }
  return "今日已完成"
}
export function DailyReviewCard() {
  const [today, setToday] = useState<TodayResponse | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void questionApiRequest<TodayResponse>("/api/questions/today")
      .then((response) => {
        if (!cancelled) setToday(response)
      })
      .catch((caught) => {
        if (!cancelled) setError(questionErrorMessage(caught, "今日复习加载失败"))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="border-t border-border/60 py-7" aria-labelledby="daily-review-heading">
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="daily-review-heading" className="flex items-center gap-2 text-lg font-semibold">
                <BookOpenCheck className="size-5 text-primary" /> 今日复习
              </h2>
              {today && <Badge variant="outline">{dailyMessage(today)}</Badge>}
            </div>
            {!today && !error && (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle className="size-4 animate-spin" /> 正在读取复习队列
              </p>
            )}
            {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
            {today && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span>今日动作 <strong className="font-medium text-foreground">{today.summary.totalActions}</strong></span>
                <span>不同题目 <strong className="font-medium text-foreground">{today.summary.uniqueQuestions}</strong></span>
                <span>作答 / 揭晓 <strong className="font-medium text-foreground">{today.summary.typedCount} / {today.summary.directRevealCount}</strong></span>
                {today.state === "WAITING" && (
                  <span className="inline-flex items-center gap-1"><Clock3 className="size-4" /> 等待短期复习到期</span>
                )}
              </div>
            )}
          </div>
          <Link href="/admin/questions" className={cn(buttonVariants({ variant: "outline" }), "h-10 shrink-0 gap-1.5 px-4")}>
            进入问题中学 <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
