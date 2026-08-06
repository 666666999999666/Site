"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Category, Post } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { normalizeContent } from "@/lib/content"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const PostEditor = dynamic(
  () => import("./PostEditor").then((mod) => mod.PostEditor),
  { ssr: false }
)

type PostWithCategory = Post & { category: Category | null }

interface DraftData {
  title: string
  content: string
  excerpt: string
  categoryId: string
  tags: string
  publishedAt: string
}

interface LocalDraft {
  savedAt: number
  data: DraftData
}

function toLocalDatetimeInput(date: string | Date): string {
  const value = new Date(date)
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function validLocalDraft(value: unknown): value is LocalDraft {
  if (!value || typeof value !== "object") return false
  const draft = value as Partial<LocalDraft>
  if (typeof draft.savedAt !== "number" || !draft.data || typeof draft.data !== "object") {
    return false
  }
  return ["title", "content", "excerpt", "categoryId", "tags", "publishedAt"].every(
    (key) => typeof draft.data?.[key as keyof DraftData] === "string"
  )
}

export function PostForm({
  post,
  categories,
}: {
  post?: PostWithCategory
  categories: Category[]
}) {
  const router = useRouter()
  const storageKey = `qz-post-draft:${post?.id || "new"}`
  const initialData = useMemo<DraftData>(() => ({
    title: post?.title || "",
    content: normalizeContent(post?.content || ""),
    excerpt: post?.excerpt || "",
    categoryId: post?.categoryId || "",
    tags: (post?.tags || []).join(", "),
    publishedAt: post?.publishedAt ? toLocalDatetimeInput(post.publishedAt) : "",
  }), [post])

  const [title, setTitle] = useState(initialData.title)
  const [content, setContent] = useState(initialData.content)
  const [excerpt, setExcerpt] = useState(initialData.excerpt)
  const [categoryId, setCategoryId] = useState(initialData.categoryId)
  const [tags, setTags] = useState(initialData.tags)
  const [publishedAt, setPublishedAt] = useState(initialData.publishedAt)
  const [recovery, setRecovery] = useState<LocalDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const uploadedUrlsRef = useRef(new Set<string>())
  const savedRef = useRef(false)

  const currentData = useMemo<DraftData>(() => ({
    title,
    content,
    excerpt,
    categoryId,
    tags,
    publishedAt,
  }), [categoryId, content, excerpt, publishedAt, tags, title])
  // #21: 按字段比较 dirty 状态，避免大内容每次按键都 JSON.stringify 两次
  const dirty =
    currentData.title !== initialData.title ||
    currentData.content !== initialData.content ||
    currentData.excerpt !== initialData.excerpt ||
    currentData.categoryId !== initialData.categoryId ||
    currentData.tags !== initialData.tags ||
    currentData.publishedAt !== initialData.publishedAt

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return
        const parsed: unknown = JSON.parse(raw)
        if (
          !cancelled &&
          validLocalDraft(parsed) &&
          (!post || parsed.savedAt > new Date(post.updatedAt).getTime()) &&
          JSON.stringify(parsed.data) !== JSON.stringify(initialData)
        ) {
          setRecovery(parsed)
        }
      } catch {
        localStorage.removeItem(storageKey)
      }
    })
    return () => {
      cancelled = true
    }
  }, [initialData, post, storageKey])

  useEffect(() => {
    if (!dirty) return
    const timeout = window.setTimeout(() => {
      const draft: LocalDraft = { savedAt: Date.now(), data: currentData }
      localStorage.setItem(storageKey, JSON.stringify(draft))
    }, 1000)
    return () => window.clearTimeout(timeout)
  }, [currentData, dirty, storageKey])

  useEffect(() => {
    if (!dirty || savedRef.current) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    const interceptNavigation = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest("a")
      if (!anchor || anchor.target === "_blank" || !anchor.href.startsWith(location.origin)) return
      if (!window.confirm("有未保存的文章修改，确认离开？")) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("click", interceptNavigation, true)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      document.removeEventListener("click", interceptNavigation, true)
    }
  }, [dirty])

  function restoreDraft() {
    if (!recovery) return
    setTitle(recovery.data.title)
    setContent(recovery.data.content)
    setExcerpt(recovery.data.excerpt)
    setCategoryId(recovery.data.categoryId)
    setTags(recovery.data.tags)
    setPublishedAt(recovery.data.publishedAt)
    setRecovery(null)
  }

  function discardRecovery() {
    localStorage.removeItem(storageKey)
    setRecovery(null)
  }

  async function cleanupNewUploads() {
    const urls = [...uploadedUrlsRef.current]
    uploadedUrlsRef.current.clear()
    await Promise.allSettled(
      urls.map((url) => apiRequest("/api/upload", jsonRequest("DELETE", { url })))
    )
  }

  async function cancel() {
    if (dirty && !window.confirm("放弃当前未保存的修改？")) return
    await cleanupNewUploads()
    localStorage.removeItem(storageKey)
    savedRef.current = true
    router.push("/admin/posts")
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (!title.trim()) {
      setError("请输入标题")
      return
    }
    setPending(true)
    setError("")
    try {
      let publishIso: string | null = null
      if (publishedAt) {
        const date = new Date(publishedAt)
        if (Number.isNaN(date.getTime())) throw new Error("发布时间无效")
        publishIso = date.toISOString()
      }
      const body = {
        title,
        content,
        excerpt,
        categoryId: categoryId || null,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        status,
        publishedAt: publishIso,
      }
      const url = post ? `/api/posts/${post.id}` : "/api/posts"
      await apiRequest(url, jsonRequest(post ? "PUT" : "POST", body))
      savedRef.current = true
      uploadedUrlsRef.current.clear()
      localStorage.removeItem(storageKey)
      router.push("/admin/posts")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {recovery && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">发现比服务器内容更新的本地草稿。</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={restoreDraft}>恢复</Button>
            <Button type="button" size="sm" variant="outline" onClick={discardRecovery}>忽略</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="文章标题"
          className="text-lg"
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">分区</Label>
          <select
            id="category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
          >
            <option value="">无分区</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">标签（逗号分隔）</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="技术, 学习"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="publishedAt">发布时间</Label>
        <Input
          id="publishedAt"
          type="datetime-local"
          value={publishedAt}
          onChange={(event) => setPublishedAt(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">摘要（可选）</Label>
        <Textarea
          id="excerpt"
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
          rows={2}
          maxLength={1000}
        />
      </div>

      <div className="space-y-2">
        <Label>正文</Label>
        <PostEditor
          value={content}
          onChange={setContent}
          onUpload={(url) => uploadedUrlsRef.current.add(url)}
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={cancel} disabled={pending}>取消</Button>
        <Button type="button" variant="outline" onClick={() => save("DRAFT")} disabled={pending}>
          {pending ? "保存中..." : "存为草稿"}
        </Button>
        <Button type="button" onClick={() => save("PUBLISHED")} disabled={pending}>
          {pending ? "保存中..." : post?.status === "PUBLISHED" ? "更新发布" : "发布"}
        </Button>
      </div>
    </div>
  )
}
