"use client"

import { NextIntlClientProvider } from "next-intl"
import { MobileTableOfContents } from "@/components/blog/MobileTableOfContents"
import zh from "@/messages/zh.json"

const headings = [
  { id: "agent-loop", text: "Agent Loop", level: 2 },
  { id: "tool-boundary", text: "工具边界", level: 3 },
]

export default function MobileTocHarnessPage() {
  return (
    <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={zh}>
      <main className="min-h-[1600px] p-6">
        <MobileTableOfContents headings={headings} />
        <h1 className="mb-96 text-3xl">移动目录测试</h1>
        <h2 id="agent-loop" className="scroll-mt-20 text-2xl">Agent Loop</h2>
        <p className="mb-96">循环内容</p>
        <h3 id="tool-boundary" className="scroll-mt-20 text-xl">工具边界</h3>
      </main>
    </NextIntlClientProvider>
  )
}
