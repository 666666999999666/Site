"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter()
  const [form, setForm] = useState({
    owner_name: initial.owner_name || "",
    email: initial.email || "",
    home_tagline: initial.home_tagline || "",
    home_role: initial.home_role || "",
    about_intro: initial.about_intro || "",
    about_whatido: initial.about_whatido || "",
    about_skills: initial.about_skills || "",
    about_github: initial.about_github || "",
  })
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setFeedback("")
    setError("")
    try {
      await apiRequest("/api/settings", jsonRequest("PUT", form))
      setFeedback("已保存")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="owner-name">姓名或个人品牌名</Label>
        <Input
          id="owner-name"
          value={form.owner_name}
          onChange={(event) => set("owner_name", event.target.value)}
          placeholder="显示在首页、导航和页脚"
          maxLength={1000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">联系邮箱</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(event) => set("email", event.target.value)}
          placeholder="name@example.com"
          maxLength={320}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="home-role">当前方向</Label>
        <Input
          id="home-role"
          value={form.home_role}
          onChange={(event) => set("home_role", event.target.value)}
          placeholder="例如：全栈开发 / 自动化测试"
          maxLength={1000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="home-tagline">首页简介</Label>
        <Input
          id="home-tagline"
          value={form.home_tagline}
          onChange={(event) => set("home_tagline", event.target.value)}
          placeholder="一句话说明网站记录什么"
          maxLength={1000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="about-intro">个人介绍</Label>
        <Textarea
          id="about-intro"
          value={form.about_intro}
          onChange={(event) => set("about_intro", event.target.value)}
          rows={4}
          placeholder="具体介绍你的经历、关注方向和目标"
          maxLength={5000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="about-whatido">我在做什么</Label>
        <Textarea
          id="about-whatido"
          value={form.about_whatido}
          onChange={(event) => set("about_whatido", event.target.value)}
          rows={4}
          placeholder="当前学习、项目或求职方向"
          maxLength={5000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="about-skills">技能标签（逗号分隔）</Label>
        <Input
          id="about-skills"
          value={form.about_skills}
          onChange={(event) => set("about_skills", event.target.value)}
          placeholder="TypeScript, React, Next.js"
          maxLength={1000}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="about-github">GitHub 链接</Label>
        <Input
          id="about-github"
          type="url"
          value={form.about_github}
          onChange={(event) => set("about_github", event.target.value)}
          placeholder="https://github.com/..."
          maxLength={1000}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
        {feedback && <span className="text-sm text-emerald-600">{feedback}</span>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
