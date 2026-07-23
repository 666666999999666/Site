"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, ShieldOff } from "lucide-react"

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => {
        router.push("/")
        router.refresh()
      }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <LogOut className="size-4" /> 退出后台
    </button>
  )
}

export function SignOutButton() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleRealLogout() {
    setLoggingOut(true)
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/")
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {showConfirm ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs text-destructive">注销后需重新输入密码</p>
          <div className="flex gap-2">
            <button
              onClick={handleRealLogout}
              disabled={loggingOut}
              className="flex-1 rounded-md bg-destructive px-2 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {loggingOut ? "注销中..." : "确认注销"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ShieldOff className="size-4" /> 注销登录
        </button>
      )}
    </div>
  )
}
