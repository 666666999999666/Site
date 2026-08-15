"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IdeaConversionDialog } from "./IdeaConversionDialog"

interface EditableIdea {
  id: string
  title: string
  content: string
  tags: string[]
  projects: Project[]
  sourceInboxItem?: { id: string; rawInput: string } | null
}

export function IdeaForm({
  idea,
  projects,
}: {
  idea?: EditableIdea
  projects: Project[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState(idea?.title ?? "")
  const [content, setContent] = useState(idea?.content ?? "")
  const [tags, setTags] = useState((idea?.tags ?? []).join(", "))
  const [projectIds, setProjectIds] = useState(() => new Set(idea?.projects.map((project) => project.id) ?? []))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  function toggleProject(id: string) {
    setProjectIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!title.trim()) {
      setError("请输入标题")
      return
    }
    setPending(true)
    setError("")
    try {
      const body = {
        title,
        content,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        projectIds: [...projectIds],
      }
      const saved = await apiRequest<{ id: string }>(
        idea ? `/api/ideas/${idea.id}` : "/api/ideas",
        jsonRequest(idea ? "PATCH" : "POST", body)
      )
      router.push(`/admin/ideas/${saved.id}`)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存 Idea 失败")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!idea || !window.confirm(`删除“${idea.title}”？此操作不可撤销。`)) return
    setPending(true)
    setError("")
    try {
      await apiRequest(`/api/ideas/${idea.id}`, jsonRequest("DELETE", {}))
      router.push("/admin/ideas")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除 Idea 失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="idea-title">标题</Label>
        <Input
          id="idea-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Idea 标题"
          maxLength={400}
          className="text-lg"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="idea-content">正文</Label>
        <Textarea
          id="idea-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="记录想法、场景和下一步实验…"
          rows={16}
          maxLength={200_000}
          className="font-mono leading-relaxed"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="idea-tags">标签（英文逗号分隔）</Label>
        <Input
          id="idea-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="学习, 编程, 产品"
        />
        <p className="text-xs text-muted-foreground">最多 20 个标签，每个不超过 50 个字符。</p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">关联项目</legend>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前没有项目。</p>
        ) : (
          <div className="grid gap-2 rounded-lg border border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <label key={project.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={projectIds.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                  className="size-4 rounded border-border"
                />
                <span className="min-w-0 truncate">{project.title}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {idea?.sourceInboxItem && (
        <details className="rounded-lg border border-border/60 p-4">
          <summary className="cursor-pointer text-sm font-medium">查看来源收件箱原文（只读）</summary>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
            {idea.sourceInboxItem.rawInput}
          </pre>
        </details>
      )}

      {idea && (
        <div className="rounded-lg border border-border/60 p-4">
          <h2 className="mb-1 font-medium">显式转换</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            转换前会打开确认表单；不会自动创建、发布或完成任何内容。
          </p>
          <IdeaConversionDialog
            ideaId={idea.id}
            title={title}
            content={content}
            tags={tags.split(",").map((tag) => tag.trim()).filter(Boolean)}
            projects={projects}
          />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {idea ? (
          <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
            删除 Idea
          </Button>
        ) : <span />}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/ideas")} disabled={pending}>
            取消
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "保存中…" : "保存 Idea"}
          </Button>
        </div>
      </div>
    </div>
  )
}
