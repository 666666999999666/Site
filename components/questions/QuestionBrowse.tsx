"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { questionApiRequest, questionErrorMessage } from "./api"
import type { QuestionDetailResponse } from "./types"
import { QuestionMarkdown } from "./QuestionMarkdown"
import { Button } from "@/components/ui/button"
import { questionEditorURL } from "@/lib/questions/navigation"

/** Deliberately GET-only: revealing an answer here is local display state. */
export function QuestionBrowse({ questionId, returnTo }: { questionId: string; returnTo: string }) {
  const [detail, setDetail] = useState<QuestionDetailResponse | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void questionApiRequest<QuestionDetailResponse>(`/api/questions/${encodeURIComponent(questionId)}`)
      .then((response) => { if (!cancelled) setDetail(response) })
      .catch((caught) => { if (!cancelled) setError(questionErrorMessage(caught, "题目加载失败")) })
    return () => { cancelled = true }
  }, [questionId])

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={returnTo} className="text-sm text-primary hover:underline">← 返回题库</Link>
        <Link href={questionEditorURL(questionId, returnTo)} className="text-sm text-muted-foreground hover:underline">编辑题目</Link>
      </div>
      <header>
        <h1 className="text-3xl font-semibold">浏览题目</h1>
        <p className="mt-2 text-sm text-muted-foreground">不评分、不记录失败，不改变到期时间或复习统计。</p>
      </header>
      {error ? <p role="alert" className="text-destructive">{error}</p> : !detail ? <p role="status">正在加载题目…</p> : <>
        <section className="rounded-xl border border-border/70 p-5 sm:p-6" aria-labelledby="browse-prompt-heading">
          <h2 id="browse-prompt-heading" className="mb-4 text-sm font-medium text-muted-foreground">题目</h2>
          <QuestionMarkdown markdown={detail.question.promptMarkdown} />
        </section>
        <Button type="button" variant="outline" aria-expanded={showAnswer} aria-controls="browse-reference-answer"
          onClick={() => setShowAnswer(value => !value)}>{showAnswer ? "收起答案" : "查看答案（不评分）"}</Button>
        {showAnswer && <section id="browse-reference-answer" className="rounded-xl border border-border/70 p-5 sm:p-6" aria-labelledby="browse-answer-heading">
          <h2 id="browse-answer-heading" className="mb-4 text-sm font-medium text-muted-foreground">参考答案</h2>
          {detail.question.referenceAnswerMarkdown
            ? <QuestionMarkdown markdown={detail.question.referenceAnswerMarkdown} />
            : <p className="text-sm text-muted-foreground">这道题还没有参考答案。</p>}
        </section>}
      </>}
    </div>
  )
}
