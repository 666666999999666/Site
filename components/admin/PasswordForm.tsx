"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PasswordForm() {
  const router = useRouter()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    if (next !== confirm) {
      setError("两次新密码不一致")
      return
    }
    if (next.length < 15) {
      setError("新密码至少 15 个字符")
      return
    }
    setPending(true)
    try {
      await apiRequest(
        "/api/auth/password",
        jsonRequest("POST", { currentPassword: current, newPassword: next })
      )
      setCurrent("")
      setNext("")
      setConfirm("")
      router.push("/zh")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current-password">当前密码</Label>
        <Input
          id="current-password"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">新密码（至少 15 个字符）</Label>
        <Input
          id="new-password"
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">确认新密码</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          required
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "修改中..." : "修改并退出登录"}
      </Button>
    </form>
  )
}
