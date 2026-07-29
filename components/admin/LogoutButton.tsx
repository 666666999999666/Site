"use client"

import { useState } from "react"
import { House, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api-client"

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push("/zh")}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <House className="size-4" />
      返回网站
    </button>
  )
}

export function SignOutButton() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function signOut() {
    setPending(true)
    setError("")
    try {
      await apiRequest("/api/auth/logout", { method: "POST" })
      router.push("/zh")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "退出登录失败")
      setPending(false)
    }
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <LogOut className="size-4" />
        退出登录
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs text-destructive">当前设备的后台会话将失效。</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={signOut}
          disabled={pending}
          className="flex-1 rounded-md bg-destructive px-2 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {pending ? "退出中..." : "确认退出"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowConfirm(false)
            setError("")
          }}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          取消
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
