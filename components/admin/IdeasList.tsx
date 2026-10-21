"use client"

import { useLayoutEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Search, Trash2 } from "lucide-react"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ideaSummary } from "@/lib/idea-summary"
import {
  EMPTY_IDEA_LIST_FILTERS, ideaDocumentHref, ideaListHref, ideaListPositionKey,
  readIdeaListFilters, readIdeaListPosition, type IdeaListFilters,
} from "@/lib/idea-list-navigation"

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

function IdeaPreview({ content }: { content: string }) {
  const summary = ideaSummary(content)
  return (
    <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
      {summary || "暂无文字摘要"}
    </p>
  )
}

export function IdeasList({
  initialIdeas,
  projects,
  initialFilters = EMPTY_IDEA_LIST_FILTERS,
  knownTags: allTags,
  ownerId = "local",
}: {
  initialIdeas: IdeaListItem[]
  projects: Project[]
  initialFilters?: IdeaListFilters
  knownTags?: string[]
  ownerId?: string
}) {
  const router = useRouter()
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const ideas = initialIdeas.filter((idea) => !removedIds.includes(idea.id))
  const [query, setQuery] = useState(initialFilters.q)
  const [tag, setTag] = useState(initialFilters.tag)
  const [projectId, setProjectId] = useState(initialFilters.projectId)
  const [mutating, setMutating] = useState(false)
  const [navigating, startTransition] = useTransition()
  const pending = mutating || navigating
  const [error, setError] = useState("")
  const listHref = ideaListHref(initialFilters)
  const positionKey = ideaListPositionKey(ownerId, listHref)

  function rememberPosition() {
    if (location.pathname !== "/admin/ideas" || ideaListHref(readIdeaListFilters(new URLSearchParams(location.search))) !== listHref) return
    try { sessionStorage.setItem(positionKey, String(window.scrollY)) } catch { /* URL state still works when storage is unavailable. */ }
  }

  useLayoutEffect(() => {
    let position = 0
    try { position = readIdeaListPosition(sessionStorage.getItem(positionKey)) } catch { /* Browser storage may be disabled. */ }
    const frame = requestAnimationFrame(() => window.scrollTo({ top: position, behavior: "instant" }))
    const remember = () => {
      if (location.pathname !== "/admin/ideas" || ideaListHref(readIdeaListFilters(new URLSearchParams(location.search))) !== listHref) return
      try { sessionStorage.setItem(positionKey, String(window.scrollY)) } catch { /* Keep navigation usable without storage. */ }
    }
    window.addEventListener("scroll", remember, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", remember) }
  }, [listHref, positionKey])

  const knownTags = useMemo(
    () => [...new Set(allTags ?? initialIdeas.flatMap((idea) => idea.tags))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [allTags, initialIdeas]
  )

  function search() {
    if (pending) return
    setError("")
    rememberPosition()
    startTransition(() => router.push(ideaListHref({ q: query, tag, projectId })))
  }

  async function remove(idea: IdeaListItem) {
    if (!window.confirm(`删除“${idea.title}”？此操作不可撤销。`)) return
    setMutating(true)
    setError("")
    try {
      await apiRequest(`/api/ideas/${idea.id}`, jsonRequest("DELETE", {}))
      setRemovedIds((current) => [...current, idea.id])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除 Idea 失败")
    } finally {
      setMutating(false)
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
          <Link href={ideaDocumentHref("new", listHref)} onClick={rememberPosition} className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
            手工创建 Idea
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {ideas.map((idea) => (
            <li key={idea.id} className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={ideaDocumentHref(idea.id, listHref)} onClick={rememberPosition} className="font-medium hover:underline">
                    {idea.title}
                  </Link>
                  <IdeaPreview content={idea.content} />
                </div>
                <Link
                  href={ideaDocumentHref(idea.id, listHref, true)}
                  onClick={rememberPosition}
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
