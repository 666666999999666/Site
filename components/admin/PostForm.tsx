"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import type { Category, Post, Series } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { uploadEmbeddedPostImages } from "@/lib/post-images"
import { imageUploadWarning, type ImageUploadResponse } from "@/lib/image-upload-response"
import { normalizeTags } from "@/lib/tags"
import { CONTENT_FORMATS, getContentFormatLabel, needsPublicationReview, scanPublicationContent, type PublicationReview } from "@/lib/publication-content"
import { ArticlePublicationPreview } from "@/components/admin/ArticlePublicationPreview"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PostEditorHandle } from "./PostEditor"
import { draftFromPost, postMutationInput, type PostDraft } from "./post-form"
import { DocumentActionBar } from "./DocumentActionBar"
import { DraftRecoveryNotice } from "./DraftRecoveryNotice"
import { useDocumentDraft } from "./useDocumentDraft"
import { clearDocumentEditQuery, useDocumentPosition } from "./useDocumentPosition"

const PostEditor = dynamic(
  () => import("./PostEditor").then((mod) => mod.PostEditor),
  { ssr: false }
)

type PostWithRelations = Post & { category: Category | null; series: Series | null }
const LEGACY_DRAFT_DEFAULTS = { seriesId: "", seriesOrder: "", contentFormat: "", readHint: "" }

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
  const savingRef = useRef(false)
  const [error, setError] = useState("")
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const reportUploadWarning = useCallback((warning: string) => {
    setUploadWarnings((previous) => previous.includes(warning) ? previous : [...previous, warning])
  }, [])
  const [publicationReview, setPublicationReview] = useState<PublicationReview | null>(null)
  const [reviewedToken, setReviewedToken] = useState("")
  const publicationReviewRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (publicationReview) publicationReviewRef.current?.focus()
  }, [publicationReview])
  const editorRef = useRef<PostEditorHandle>(null)
  const uploadedUrlsRef = useRef(new Set<string>())
  const embeddedUploadsRef = useRef(new Map<string, string>())
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
  const { title, content, excerpt, contentFormat, readHint, categoryId, seriesId, seriesOrder, tags, publishedAt } = draft.data
  const locked = pending || !draft.ready || !!draft.recovery

  function setField(key: keyof PostDraft, value: string) {
    const current = draft.current()
    // The editor also emits a delayed serialization callback after a synchronous
    // document update. An identical value must not erase a pending review.
    if (current[key] === value) return
    if (["title", "content", "excerpt"].includes(key)) {
      setPublicationReview(null)
      setReviewedToken("")
    }
    draft.update({ ...current, [key]: value })
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
    setUploadWarnings([])
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
    embeddedUploadsRef.current.clear()
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
    setPublicationReview(null)
    setReviewedToken("")
    setEditorCreated(false)
    setError("")
    setUploadWarnings([])
    setPending(false)
    if (savedPost) { switchMode("read"); clearDocumentEditQuery() }
    else router.push("/admin/posts")
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (pending || savingRef.current) return
    savingRef.current = true
    setPending(true)
    setError("")
    try {
      const editorContent = await editorRef.current?.getMarkdownForSave()
      let current = { ...draft.current(), content: editorContent ?? draft.current().content }
      draft.update(current)
      if (!current.title.trim()) { setError("请输入标题"); return }
      const content = await uploadEmbeddedPostImages(current.content, async (file) => {
        const form = new FormData()
        form.append("file", file)
        const uploaded = await apiRequest<ImageUploadResponse>("/api/upload", { method: "POST", body: form })
        if (!uploaded?.url) throw new Error("图片上传失败")
        uploadedUrlsRef.current.add(uploaded.url)
        const warning = imageUploadWarning(uploaded)
        if (warning) reportUploadWarning(warning)
        return uploaded.url
      }, embeddedUploadsRef.current)
      if (content !== current.content) {
        current = { ...current, content }
        // Commit the controlled editor's replacement before returning to its
        // debounced Markdown listener. Otherwise a queued callback can read the
        // old data-URI document and overwrite the uploaded URLs (and review).
        flushSync(() => draft.update(current))
      }
      let publicationReviewToken: string | undefined
      if (needsPublicationReview(savedPost ?? null, { ...current, status })) {
        const review = scanPublicationContent(current)
        if (review.totalWarnings > 0) {
          setPublicationReview(review)
          if (reviewedToken !== review.reviewToken) return
          publicationReviewToken = review.reviewToken
        }
      }
      const body = postMutationInput(current, draft.baseline, !!savedPost, status, publicationReviewToken)
      const saved = await apiRequest<PostWithRelations>(
        savedPost ? "/api/posts/" + savedPost.id : "/api/posts",
        jsonRequest(savedPost ? "PUT" : "POST", body)
      )
      setSavedPost(saved)
      setPublicationReview(null)
      setReviewedToken("")
      draft.commit(draftFromPost(saved))
      uploadedUrlsRef.current.clear()
      embeddedUploadsRef.current.clear()
      setEditorCreated(false)
      switchMode("read")
      if (!post) router.replace("/admin/posts/" + saved.id)
      else clearDocumentEditQuery()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      savingRef.current = false
      setPending(false)
    }
  }

  const displayTitle = mode === "read" ? savedPost?.title : title
  const displayTags = mode === "read" ? savedPost?.tags ?? [] : normalizeTags([tags])
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
      {uploadWarnings.length > 0 && <div role="status" aria-label="图片处理提示" className="mb-4 space-y-1 text-sm text-amber-700 dark:text-amber-300">
        {uploadWarnings.map((warning) => <p key={warning}>{warning}</p>)}
      </div>}
      {draft.storageError && <p role="alert" className="mb-4 text-sm text-destructive">{draft.storageError}</p>}
      {publicationReview && (
        <section ref={publicationReviewRef} tabIndex={-1} aria-labelledby="publication-review-title" className="mb-6 rounded-xl border border-amber-500/60 bg-amber-50/40 p-4 dark:bg-amber-950/20">
          <h2 id="publication-review-title" className="font-semibold">发布前有 {publicationReview.totalWarnings} 处内容需要确认</h2>
          <p className="mt-2 text-sm text-muted-foreground">这些是人工复核提示，不会自动替换正文。位置按规范化 Markdown 标注；请结合字符串、注释和图片用途判断。</p>
          <details className="mt-3" open>
            <summary className="cursor-pointer text-sm font-medium">查看位置和上下文</summary>
            <ol className="mt-3 max-h-80 space-y-3 overflow-auto pl-5 text-sm">
              {publicationReview.warnings.map((warning, index) => (
                <li key={`${warning.code}-${warning.offset}-${index}`} className="list-decimal">
                  <p>第 {warning.line} 行，第 {warning.column} 列{warning.codeBlock ? ` · 代码块 ${warning.codeBlock}${warning.language ? ` (${warning.language})` : ""}` : ""}：{warning.message}</p>
                  <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{warning.context}</pre>
                </li>
              ))}
            </ol>
          </details>
          {publicationReview.truncated && <p className="mt-2 text-sm">仅显示前 {publicationReview.warnings.length} 处。请先修正后重新检查，或使用只读扫描脚本查看文章问题。</p>}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4" disabled={pending}
              checked={reviewedToken === publicationReview.reviewToken}
              onChange={(event) => setReviewedToken(event.target.checked ? publicationReview.reviewToken : "")} />
            <span>我已核对这些提示，确认当前内容可以发布。勾选后再次点击“发布”或“更新发布”。</span>
          </label>
        </section>
      )}

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
              publication={mode === "read" ? savedPost : { title, excerpt, contentFormat, readHint }}
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
          aria-describedby="excerpt-help"
        />
        <p id="excerpt-help" className="text-xs text-muted-foreground">独立介绍读者的问题、方法或收获。卡片、RSS 与搜索描述共用此摘要；留空时只提取可读正文，不使用图片 alt 或代码。</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contentFormat">内容形式</Label>
          <select id="contentFormat" value={contentFormat} disabled={locked}
            onChange={(event) => setField("contentFormat", event.target.value)}
            className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm">
            <option value="">自动判断</option>
            {CONTENT_FORMATS.map((format) => <option key={format} value={format}>{getContentFormatLabel({ contentFormat: format })}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="readHint">阅读提示（可选）</Label>
          <Input id="readHint" value={readHint} disabled={locked} maxLength={120}
            onChange={(event) => setField("readHint", event.target.value)}
            placeholder="例如：约 15 分钟，含 6 张图解" aria-describedby="read-hint-help" />
          <p id="read-hint-help" className="text-xs text-muted-foreground">优先显示此提示。留空时，纯图文章显示图片数量，文字文章显示估计时长。</p>
        </div>
      </div>

        <div className="space-y-2">
          <Label>正文</Label>
          {editorCreated && <PostEditor value={content} onChange={setContent}
            onDocumentChange={setContent} controlRef={editorRef}
            onUpload={(url) => uploadedUrlsRef.current.add(url)} onUploadWarning={reportUploadWarning} />}
        </div>
        {savedPost?.status === "PUBLISHED" && (
          <p className="text-sm text-muted-foreground">“撤回为草稿”会取消公开发布；“更新发布”保留发布状态。预览不会执行这些操作。</p>
        )}
      </div>
    </div>
  )
}
