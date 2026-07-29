"use client"

import Link from "next/link"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[PublicPageError]", error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">页面暂时无法加载</h1>
      <p className="mt-3 text-sm text-muted-foreground">请稍后重试，已发布内容不会因此丢失。</p>
      <div className="mt-6 flex gap-3">
        <Button type="button" onClick={reset}>重试</Button>
        <Link
          href="/zh"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          返回首页
        </Link>
      </div>
    </div>
  )
}
