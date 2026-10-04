"use client"

import dynamic from "next/dynamic"
import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Category, Post, Series } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { ArticlePublicationPreview } from "@/components/admin/ArticlePublicationPreview"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PostEditorHandle } from "./PostEditor"
import { DocumentActionBar } from "./DocumentActionBar"
import { DraftRecoveryNotice } from "./DraftRecoveryNotice"
import { useDocumentDraft } from "./useDocumentDraft"
import { clearDocumentEditQuery, useDocumentPosition } from "./useDocumentPosition"

const PostEditor = dynamic(
  () => import("./PostEditor").then((mod) => mod.PostEditor),
  { ssr: false }
)

type PostWithRelations = Post & { category: Category | null; series: Series | null }
type DraftData = {
  title: string
  content: string
  excerpt: string
  categoryId: string
  seriesId: string
  seriesOrder: string
  tags: string
  publishedAt: string
}
const LEGACY_DRAFT_DEFAULTS = { seriesId: "", seriesOrder: "" }

function toLocalDatetimeInput(date: string | Date): string {
  const value = new Date(date)
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function draftFromPost(post?: PostWithRelations): DraftData {
  return {
    title: post?.title ?? "",
    content: post?.content ?? "",
    excerpt: post?.excerpt ?? "",
    categoryId: post?.categoryId ?? "",
    seriesId: post?.seriesId ?? "",
    seriesOrder: post?.seriesOrder == null ? "" : String(post.seriesOrder),
    tags: (post?.tags ?? []).join(", "),
    publishedAt: post?.publishedAt ? toLocalDatetimeInput(post.publishedAt) : "",
  }
}

export function PostForm({
  post, categories, series, ownerId, initiallyEditing = false,
}: {
  post?: PostWithRelations
  categories: Category[]
  series: Series[]
  ownerId?: string
  initiallyEditing?: boolean
}) {
  const router = useRouter()
  const [savedPost, setSavedPost] = useState(post)
  const [editorCreated, setEditorCreated] = useState(!post || initiallyEditing)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const editorRef = useRef<PostEditorHandle>(null)
  const uploadedUrlsRef = useRef(new Set<string>())
  const focusEditor = useCallback(() => editorRef.current?.focus(), [])
  const { mode, switchMode } = useDocumentPosition(!post || initiallyEditing ? "edit" : "read", focusEditor)
  const initialData = useMemo(() => draftFromPost(post), [post])
  const oldStorageKey = "qz-post-draft:" + (post?.id ?? "new")
  const draft = useDocumentDraft({
    initialData,
    storageKey: ownerId ? "qz-post-draft:" + ownerId + ":" + (post?.id ?? "new") : oldStorageKey,
    legacyStorageKey: ownerId ? oldStorageKey : undefined,
    legacyDefaults: LEGACY_DRAFT_DEFAULTS,
    label: "文章",
  })
  const { title, content, excerpt, categoryId, seriesId, seriesOrder, tags, publishedAt } = draft.data
  const locked = pending || !draft.ready || !!draft.recovery

  function setField(key: keyof DraftData, value: string) {
    draft.update({ ...draft.current(), [key]: value })
  }
  const setTitle = (value: string) => setField("title", value)
  const setContent = (value: string) => setField("content", value)
  const setExcerpt = (value: string) => setField("excerpt", value)
  const setCategoryId = (value: string) => setField("categoryId", value)
  const setSeriesId = (value: string) => setField("seriesId", value)
  const setSeriesOrder = (value: string) => setField("seriesOrder", value)
  const setTags = (value: string) => setField("tags", value)
  const setPublishedAt = (value: string) => setField("publishedAt", value)

  function beginEditing() {
    if (draft.recovery) {
      setError("请先恢复或丢弃已有本地草稿，再开始新的编辑。")
      return
    }
    setError("")
    setEditorCreated(true)
    switchMode("edit")
  }

  function changeSurface(next: "edit" | "preview") {
    const snapshot = editorRef.current?.getMarkdown()
    if (snapshot !== undefined) setContent(snapshot)
    switchMode(next)
  }

  async function cleanupNewUploads() {
    const urls = [...uploadedUrlsRef.current]
    uploadedUrlsRef.current.clear()
    await Promise.allSettled(urls.map((url) => apiRequest("/api/upload", jsonRequest("DELETE", { url }))))
  }

  async function cancel() {
    const snapshot = editorRef.current?.getMarkdown()
    if (snapshot !== undefined) setContent(snapshot)
    if ((snapshot !== undefined && snapshot !== draft.baseline.content || draft.dirty) &&
      !window.confirm("放弃当前未保存的修改？")) return
    setPending(true)
    await cleanupNewUploads()
    draft.discard()
    setEditorCreated(false)
    setError("")
    setPending(false)
    if (savedPost) { switchMode("read"); clearDocumentEditQuery() }
    else router.push("/admin/posts")
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (pending) return
    const current = { ...draft.current(), content: editorRef.current?.getMarkdown() ?? draft.current().content }
    draft.update(current)
    if (!current.title.trim()) { setError("请输入标题"); return }
    setPending(true)
    setError("")
    try {
      let publishIso: string | null = null
      if (current.publishedAt) {
        const date = new Date(current.publishedAt)
        if (Number.isNaN(date.getTime())) throw new Error("发布时间无效")
        publishIso = date.toISOString()
      }
      const fields = {
        title: current.title,
        // 未改正文时不发送 content，避免保存 metadata 顺带规范化旧格式。
        ...(!savedPost || current.content !== draft.baseline.content ? { content: current.content } : {}),
        excerpt: current.excerpt,
        categoryId: current.categoryId || null,
        seriesId: current.seriesId || null,
        seriesOrder: current.seriesId ? (current.seriesOrder.trim() ? Number(current.seriesOrder) : null) : null,
        tags: current.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        publishedAt: publishIso,
      }
      const body = savedPost ? {
        status,
        ...Object.fromEntries(Object.entries(fields).filter(([key]) => (
          current[key as keyof DraftData] !== draft.baseline[key as keyof DraftData] ||
          key === "seriesOrder" && current.seriesId !== draft.baseline.seriesId
        ))),
      } : { ...fields, status }
      const saved = await apiRequest<PostWithRelations>(
        savedPost ? "/api/posts/" + savedPost.id : "/api/posts",
        jsonRequest(savedPost ? "PUT" : "POST", body)
      )
      setSavedPost(saved)
      draft.commit(draftFromPost(saved))
      uploadedUrlsRef.current.clear()
      setEditorCreated(false)
      switchMode("read")
      if (!post) router.replace("/admin/posts/" + saved.id)
      else clearDocumentEditQuery()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      setPending(false)
    }
  }

  const displayTitle = mode === "read" ? savedPost?.title : title
  const displayTags = mode === "read" ? savedPost?.tags ?? [] : tags.split(",").map((tag) => tag.trim()).filter(Boolean)
  const displayCategoryId = mode === "read" ? savedPost?.categoryId : categoryId
  const displayCategory = categories.find((category) => category.id === displayCategoryId)
  const displaySeriesId = mode === "read" ? savedPost?.seriesId : seriesId
  const displaySeries = series.find((item) => item.id === displaySeriesId)

  return (
    <div className="admin-document min-w-0">
      <DocumentActionBar mode={mode} dirty={draft.dirty} pending={pending} ready={draft.ready}
        status={savedPost?.status === "PUBLISHED" ? "已发布" : "草稿"}
        onBack={() => { if (draft.confirmLeave()) router.push("/admin/posts") }}
        onEdit={beginEditing} onModeChange={changeSurface} onCancel={() => { void cancel() }}>
        <Button type="button" size="sm" variant="outline" onClick={() => save("DRAFT")} disabled={locked}>
          {savedPost?.status === "PUBLISHED" ? "撤回为草稿" : "存为草稿"}
        </Button>
        <Button type="button" size="sm" onClick={() => save("PUBLISHED")} disabled={locked}>
          {savedPost?.status === "PUBLISHED" ? "更新发布" : "发布"}
        </Button>
      </DocumentActionBar>

      {draft.recovery && <DraftRecoveryNotice
        onRestore={() => { draft.restore(); setEditorCreated(true); setError(""); switchMode("edit") }}
        onDiscard={() => { draft.discardRecovery(); setError("") }} />}
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {draft.storageError && <p role="alert" className="mb-4 text-sm text-destructive">{draft.storageError}</p>}

      {mode !== "edit" && (
        <article className="mx-auto min-w-0 max-w-3xl" id={mode === "preview" ? "document-preview" : undefined}
          aria-label={mode === "read" ? "文章阅读" : "文章预览"}>
          <header className="mb-8 space-y-4">
            <p className="text-xs text-muted-foreground">{savedPost?.status === "PUBLISHED" ? "已发布文章" : "未发布草稿"}</p>
            <h1 className="break-words text-2xl font-semibold leading-tight sm:text-3xl">{displayTitle || "未命名文章"}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {displayCategory && <span className="rounded-md border border-border px-2 py-1">{displayCategory.name}</span>}
              {displaySeries && <span className="rounded-md border border-border px-2 py-1">{displaySeries.title}</span>}
              {displayTags.map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-1">{"#" + tag}</span>)}
            </div>
          </header>
          <div className="admin-reading">
            <ArticlePublicationPreview content={mode === "read" ? savedPost?.content ?? "" : content}
              label={mode === "read" ? "文章正文" : "发布效果预览"} />
          </div>
        </article>
      )}

      <div id="document-edit" hidden={mode !== "edit"} inert={locked} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="文章标题"
          className="text-lg"
          maxLength={200}
          disabled={locked}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">分区</Label>
          <select
            id="category"
            value={categoryId}
            disabled={locked}
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
            disabled={locked}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-2">
          <Label htmlFor="series">系列</Label>
          <select
            id="series"
            value={seriesId}
            disabled={locked}
            onChange={(event) => {
              setSeriesId(event.target.value)
              if (!event.target.value) setSeriesOrder("")
            }}
            className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
          >
            <option value="">无系列</option>
            {series.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="seriesOrder">系列内顺序</Label>
          <Input
            id="seriesOrder"
            type="number"
            min={0}
            max={10000}
            value={seriesOrder}
            onChange={(event) => setSeriesOrder(event.target.value)}
            placeholder="自动取下一位"
            disabled={locked || !seriesId}
          />
          <p className="text-xs text-muted-foreground">留空时自动排到末尾</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="publishedAt">发布时间</Label>
        <Input
          id="publishedAt"
          type="datetime-local"
          disabled={locked}
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
          disabled={locked}
        />
      </div>


        <div className="space-y-2">
          <Label>正文</Label>
          {editorCreated && <PostEditor value={content} onChange={setContent}
            onDocumentChange={setContent} controlRef={editorRef}
            onUpload={(url) => uploadedUrlsRef.current.add(url)} />}
        </div>
        {savedPost?.status === "PUBLISHED" && (
          <p className="text-sm text-muted-foreground">“撤回为草稿”会取消公开发布；“更新发布”保留发布状态。预览不会执行这些操作。</p>
        )}
      </div>
    </div>
  )
}
