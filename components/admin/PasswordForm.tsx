"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function PasswordForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [ok, setOk] = useState(false)

  async function save() {
    setError("")
    setOk(false)
    if (next !== confirm) { setError("两次新密码不一致"); return }
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })
    if (res.ok) {
      setOk(true)
      setCurrent(""); setNext(""); setConfirm("")
    } else {
      const data = await res.json()
      setError(data.error || "修改失败")
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label>当前密码</Label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>新密码（至少 6 位）</Label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>确认新密码</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-accent">已修改</p>}
      <Button onClick={save}>修改密码</Button>
    </div>
  )
}
