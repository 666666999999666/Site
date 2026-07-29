"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[AdminPageError]", error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] max-w-lg flex-col justify-center">
      <h1 className="text-2xl font-semibold">后台页面加载失败</h1>
      <p className="mt-3 text-sm text-muted-foreground">未提交的表单内容请先保留在当前页面，再尝试重载。</p>
      <Button type="button" onClick={reset} className="mt-6 w-fit">重试</Button>
    </div>
  )
}
