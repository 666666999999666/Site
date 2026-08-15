"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Pencil, Search, Trash2 } from "lucide-react"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface IdeaListItem {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: Date | string
  updatedAt: Date | string
  projects: Project[]
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
}

function preview(content: string) {
  const compact = content.replace(/\s+/g, " ").trim()
  return [...compact].slice(0, 100).join("") + ([...compact].length > 100 ? "…" : "")
}

export function IdeasList({
  initialIdeas,
  projects,
}: {
  initialIdeas: IdeaListItem[]
  projects: Project[]
}) {
  const [ideas, setIdeas] = useState(initialIdeas)
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState("")
  const [projectId, setProjectId] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const knownTags = useMemo(
    () => [...new Set(initialIdeas.flatMap((idea) => idea.tags))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [initialIdeas]
  )

  async function search() {
    setPending(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (tag) params.set("tag", tag)
      if (projectId) params.set("projectId", projectId)
      const data = await apiRequest<IdeaListItem[]>(`/api/ideas?${params.toString()}`)
      setIdeas(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "搜索 Idea 失败")
    } finally {
      setPending(false)
    }
  }

  async function remove(idea: IdeaListItem) {
    if (!window.confirm(`删除“${idea.title}”？此操作不可撤销。`)) return
    setPending(true)
    setError("")
    try {
      await apiRequest(`/api/ideas/${idea.id}`, jsonRequest("DELETE", {}))
      setIdeas((current) => current.filter((item) => item.id !== idea.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除 Idea 失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_200px_auto]">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) void search()
            }}
            placeholder="搜索标题或正文"
            maxLength={200}
            className="pl-9"
          />
        </div>
        <select
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="h-10 rounded-md border border-border/50 bg-background px-3 text-sm"
          aria-label="按标签筛选"
        >
          <option value="">全部标签</option>
          {knownTags.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="h-10 rounded-md border border-border/50 bg-background px-3 text-sm"
          aria-label="按项目筛选"
        >
          <option value="">全部项目</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.title}</option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={search} disabled={pending}>
          <Search className="size-4" /> 搜索
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {ideas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">没有符合条件的 Idea。</p>
          <Link href="/admin/ideas/new" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
            手工创建 Idea
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {ideas.map((idea) => (
            <li key={idea.id} className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/ideas/${idea.id}`} className="font-medium hover:underline">
                    {idea.title}
                  </Link>
                  {preview(idea.content) && (
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {preview(idea.content)}
                    </p>
                  )}
                </div>
                <Link
                  href={`/admin/ideas/${idea.id}`}
                  className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
                  aria-label={`编辑 Idea ${idea.title}`}
                >
                  <Pencil className="size-4" />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(idea)}
                  disabled={pending}
                  aria-label={`删除 Idea ${idea.title}`}
                  className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {(idea.tags.length > 0 || idea.projects.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {idea.tags.map((item) => (
                    <span key={`tag:${item}`} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      #{item}
                    </span>
                  ))}
                  {idea.projects.map((project) => (
                    <span key={`project:${project.id}`} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {project.title}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">更新于 {formatDate(idea.updatedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
