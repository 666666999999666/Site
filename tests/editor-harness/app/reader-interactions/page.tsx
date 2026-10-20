"use client"

import { useState } from "react"
import { NextIntlClientProvider } from "next-intl"
import { PostContent } from "@/components/blog/PostContent"
import { readerInteractionContent } from "@/tests/fixtures/reader-interactions"
import { readerImageMetadata } from "@/tests/fixtures/reader-image-metadata"
import zh from "@/messages/zh.json"

export default function ReaderInteractionsPage() {
  const [clicks, setClicks] = useState(0)
  const [showReader, setShowReader] = useState(true)
  return (
    <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={zh}>
      <main>
        <button type="button" id="background-action" onClick={() => setClicks((count) => count + 1)}>背景按钮 {clicks}</button>
        <button type="button" onClick={() => setShowReader((show) => !show)}>切换阅读组件</button>
        {showReader && <section data-reader-one><PostContent content={readerInteractionContent} /></section>}
        <section data-reader-two><PostContent content="![另一篇图片](/reader-small.svg)" /></section>
        <section data-responsive-reader>
          <PostContent
            content={'![响应式图片](/reader-responsive.png "响应式图片说明 {qz-width=240}")'}
            imageMetadata={readerImageMetadata}
          />
        </section>
        <section data-decorative-reader><PostContent content="![](/reader-small.svg)" /></section>
      </main>
    </NextIntlClientProvider>
  )
}
