"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter()
  const [form, setForm] = useState({
    owner_name: initial.owner_name || "",
    tagline: initial.tagline || "",
    email: initial.email || "",
  })
  const [pending, startTransition] = useTransition()

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label>姓名</Label>
        <Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>一句话标语</Label>
        <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>邮箱</Label>
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <Button onClick={save} disabled={pending}>保存</Button>
    </div>
  )
}
