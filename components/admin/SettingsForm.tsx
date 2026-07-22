"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter()
  const [form, setForm] = useState({
    owner_name: initial.owner_name || "",
    email: initial.email || "",
    home_tagline: initial.home_tagline || "",
    about_intro: initial.about_intro || "",
    about_skills: initial.about_skills || "",
    about_github: initial.about_github || "",
    about_email: initial.about_email || "",
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
        <Label>邮箱</Label>
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>首页标语</Label>
        <Input value={form.home_tagline} onChange={(e) => set("home_tagline", e.target.value)} placeholder="首页 Hero 区域的描述文字" />
      </div>

      <div className="space-y-2">
        <Label>关于页介绍</Label>
        <Textarea value={form.about_intro} onChange={(e) => set("about_intro", e.target.value)} rows={3} placeholder="关于页的自我介绍" />
      </div>

      <div className="space-y-2">
        <Label>技能标签（逗号分隔）</Label>
        <Input value={form.about_skills} onChange={(e) => set("about_skills", e.target.value)} placeholder="TypeScript,React,Next.js" />
      </div>

      <div className="space-y-2">
        <Label>GitHub 链接</Label>
        <Input value={form.about_github} onChange={(e) => set("about_github", e.target.value)} placeholder="https://github.com/..." />
      </div>

      <div className="space-y-2">
        <Label>邮箱（关于页）</Label>
        <Input type="email" value={form.about_email} onChange={(e) => set("about_email", e.target.value)} placeholder="关于页联系方式邮箱" />
      </div>

      <Button onClick={save} disabled={pending}>保存</Button>
    </div>
  )
}
