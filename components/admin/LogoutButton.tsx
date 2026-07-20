"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

export function LogoutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" })
        router.push("/")
        router.refresh()
      }}
      className="flex items-center gap-3 px-4 py-2 text-sm text-ink-muted hover:text-accent transition-colors"
    >
      <LogOut className="h-4 w-4" /> 退出
    </button>
  )
}
