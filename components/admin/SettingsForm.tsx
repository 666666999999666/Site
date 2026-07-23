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
    about_whatido: initial.about_whatido || "",
    about_skills: initial.about_skills || "",
    about_github: initial.about_github || "",
  })
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          setFeedback("saved")
          router.refresh()
        } else {
          setFeedback("error")
        }
      } catch {
        setFeedback("error")
      }
      setTimeout(() => setFeedback(null), 2000)
    })
  }

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label>姓名</Label>
        <Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} placeholder="显示在页脚版权信息中" />
      </div>
      <div className="space-y-2">
        <Label>邮箱</Label>
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="关于页联系方式邮箱" />
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
        <Label>我做什么</Label>
        <Textarea value={form.about_whatido} onChange={(e) => set("about_whatido", e.target.value)} rows={3} placeholder="描述你做什么工作/提供什么服务" />
      </div>

      <div className="space-y-2">
        <Label>技能标签（逗号分隔）</Label>
        <Input value={form.about_skills} onChange={(e) => set("about_skills", e.target.value)} placeholder="TypeScript,React,Next.js" />
      </div>

      <div className="space-y-2">
        <Label>GitHub 链接</Label>
        <Input value={form.about_github} onChange={(e) => set("about_github", e.target.value)} placeholder="https://github.com/..." />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>保存</Button>
        {feedback === "saved" && <span className="text-sm text-green-600">已保存</span>}
        {feedback === "error" && <span className="text-sm text-red-600">保存失败</span>}
      </div>
    </div>
  )
}
