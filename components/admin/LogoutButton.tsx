"use client"

import { useState } from "react"
import { House, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api-client"
import { cn } from "@/lib/utils"

interface CollapsibleButtonProps {
  collapsed?: boolean
}

export function LogoutButton({ collapsed = false }: CollapsibleButtonProps = {}) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push("/zh")}
      title={collapsed ? "返回网站" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      <House aria-hidden="true" className="size-4 shrink-0" />
      <span className={cn(collapsed && "sr-only")}>返回网站</span>
    </button>
  )
}

interface SignOutButtonProps extends CollapsibleButtonProps {
  onRequestExpand?: () => void
}

export function SignOutButton({
  collapsed = false,
  onRequestExpand,
}: SignOutButtonProps = {}) {
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

  if (!showConfirm || collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          onRequestExpand?.()
          setShowConfirm(true)
        }}
        title={collapsed ? "退出登录" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center px-0"
        )}
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        <span className={cn(collapsed && "sr-only")}>退出登录</span>
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
