"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { Project } from "@/lib/generated/prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter()
  const [title, setTitle] = useState(project?.title || "")
  const [description, setDescription] = useState(project?.description || "")
  const [tags, setTags] = useState((project?.tags || []).join(", "))
  const [sourceUrl, setSourceUrl] = useState(project?.sourceUrl || "")
  const [demoUrl, setDemoUrl] = useState(project?.demoUrl || "")
  const [pending, startTransition] = useTransition()

  async function save() {
    if (!title.trim()) {
      alert("请输入标题")
      return
    }
    startTransition(async () => {
      const body = {
        title,
        description: description || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        sourceUrl: sourceUrl || null,
        demoUrl: demoUrl || null,
      }
      const url = project ? `/api/projects/${project.id}` : "/api/projects"
      const method = project ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.push("/admin/projects")
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || "保存失败")
      }
    })
  }

  async function del() {
    if (!project) return
    if (!confirm("确认删除此项目？此操作不可撤销。")) return
    startTransition(async () => {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" })
      if (res.ok) {
        router.push("/admin/projects")
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || "删除失败")
      }
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="项目标题" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">描述（可选）</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="项目简介" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">标签（逗号分隔）</Label>
        <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Next.js, TypeScript, Prisma" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sourceUrl">源码链接（可选）</Label>
        <Input id="sourceUrl" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://github.com/..." />
      </div>

      <div className="space-y-2">
        <Label htmlFor="demoUrl">Demo 链接（可选）</Label>
        <Input id="demoUrl" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://..." />
      </div>

      <div className="flex gap-3 justify-between">
        {project ? (
          <Button variant="outline" onClick={del} disabled={pending} className="hover:bg-destructive/10 hover:text-destructive">删除</Button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/admin/projects")} disabled={pending}>取消</Button>
          <Button onClick={save} disabled={pending}>保存</Button>
        </div>
      </div>
    </div>
  )
}
