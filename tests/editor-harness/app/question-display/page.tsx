"use client"

import { useState } from "react"
import { QuestionAttemptList } from "@/components/questions/QuestionAttemptList"
import { QuestionMarkdown } from "@/components/questions/QuestionMarkdown"
import { QuestionMarkdownEditor } from "@/components/questions/QuestionMarkdownEditor"

const answer = [
  "【面试口述答案】",
  "这两个命令的响应时机完全不同。`agent.run` 是一次性任务入口，收到后创建一个会话，把运行当作后台任务后立即返回标识。",
  "`session.send_message` 是多轮对话入口，请求会绑定到正在连接的任务；客户端断开后，这个请求会被取消。",
  "【理解与记忆】记忆线索：一次性任务适合下单就走，聊天适合发一句、等一句。",
  "",
  "【典型追问】  ",
  "显式 Markdown 换行不能变成两个空行。",
].join("\n")

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
