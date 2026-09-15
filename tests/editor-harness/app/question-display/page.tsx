"use client"

import { useState } from "react"
import { QuestionAttemptList } from "@/components/questions/QuestionAttemptList"
import { QuestionMarkdown } from "@/components/questions/QuestionMarkdown"
import { QuestionMarkdownEditor } from "@/components/questions/QuestionMarkdownEditor"

const answer = "第一行答案。\n\n第二段包含 **重点** 和 `code`。"

export default function QuestionDisplayHarnessPage() {
  const [value, setValue] = useState(answer)
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <QuestionMarkdownEditor
        id="answer-source"
        label="标准答案"
        value={value}
        onChange={setValue}
        allowImages={false}
      />
      <section aria-label="正式揭晓" className="rounded-xl border p-5">
        <QuestionMarkdown markdown={value} />
      </section>
      <section aria-label="历史答案" className="rounded-xl border p-5">
        <QuestionAttemptList attempts={[{
          id: "attempt-1",
          answerMarkdown: value,
          rating: "GOOD",
          mode: "TYPED",
          createdAt: "2026-09-15T00:00:00.000Z",
        }]} />
      </section>
    </main>
  )
}
