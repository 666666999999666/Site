"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole } from "lucide-react"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IdeaConversionDialog } from "./IdeaConversionDialog"
import { IdeaContent } from "./IdeaContent"
import { DocumentActionBar } from "./DocumentActionBar"
import { DraftRecoveryNotice } from "./DraftRecoveryNotice"
import { useDocumentDraft } from "./useDocumentDraft"
import { clearDocumentEditQuery, useDocumentPosition } from "./useDocumentPosition"

interface EditableIdea {
  id: string
  ownerId?: string
  title: string
  content: string
  tags: string[]
  projects: Project[]
  sourceInboxItem?: { id: string; rawInput: string } | null
}

type IdeaDraft = { title: string; content: string; tags: string; projectIds: string[] }
function draftFromIdea(idea?: EditableIdea): IdeaDraft {
  return {
    title: idea?.title ?? "",
    content: idea?.content ?? "",
    tags: (idea?.tags ?? []).join(", "),
    projectIds: (idea?.projects.map((project) => project.id) ?? []).sort(),
  }
}

export function IdeaForm({
  idea, projects, ownerId, initiallyEditing = false,
}: {
  idea?: EditableIdea
  projects: Project[]
  ownerId?: string
  initiallyEditing?: boolean
}) {
  const router = useRouter()
  const [savedIdea, setSavedIdea] = useState(idea)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const focusEditor = useCallback(() => editorRef.current?.focus({ preventScroll: true }), [])
  const { mode, switchMode } = useDocumentPosition(!idea || initiallyEditing ? "edit" : "read", focusEditor)
  const initialData = useMemo(() => draftFromIdea(idea), [idea])
  const draft = useDocumentDraft({
    initialData,
    storageKey: "qz-idea-draft:" + (ownerId ?? idea?.ownerId ?? "local") + ":" + (idea?.id ?? "new"),
    label: "Idea",
  })
  const { data } = draft
  const editing = mode !== "read"
  const locked = pending || !draft.ready || !!draft.recovery

  function beginEditing() {
    if (draft.recovery) {
      setError("请先恢复或丢弃已有本地草稿，再开始新的编辑。")
      return
    }
    setError("")
    switchMode("edit")
  }

  function cancel() {
    if (draft.dirty && !window.confirm("放弃当前未保存的修改？")) return
    draft.discard()
    setError("")
    if (savedIdea) { switchMode("read"); clearDocumentEditQuery() }
    else router.push("/admin/ideas")
  }

  async function save() {
    if (!data.title.trim()) { setError("请输入标题"); return }
    setPending(true)
    setError("")
    try {
      const allFields = {
        title: data.title, content: data.content,
        tags: data.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        projectIds: data.projectIds,
      }
      const body = savedIdea
        ? Object.fromEntries(Object.entries(allFields).filter(([key]) => (
          key === "projectIds"
            ? data.projectIds.join("\0") !== draft.baseline.projectIds.join("\0")
            : data[key as "title" | "content" | "tags"] !== draft.baseline[key as "title" | "content" | "tags"]
        )))
        : allFields
      if (savedIdea && Object.keys(body).length === 0) {
        switchMode("read")
        return
      }
      const saved = await apiRequest<EditableIdea>(
        savedIdea ? "/api/ideas/" + savedIdea.id : "/api/ideas",
        jsonRequest(savedIdea ? "PATCH" : "POST", body)
      )
      setSavedIdea(saved)
      draft.commit(draftFromIdea(saved))
      switchMode("read")
      if (!idea) router.replace("/admin/ideas/" + saved.id)
      else clearDocumentEditQuery()
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存 Idea 失败")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!savedIdea || !window.confirm("删除“" + savedIdea.title + "”？此操作不可撤销。")) return
    setPending(true)
    setError("")
    try {
      await apiRequest("/api/ideas/" + savedIdea.id, jsonRequest("DELETE", {}))
      draft.discard()
      router.push("/admin/ideas")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除 Idea 失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="admin-document min-w-0 max-w-4xl">
      <DocumentActionBar mode={mode} dirty={draft.dirty} pending={pending} ready={draft.ready} status="私人 Idea"
        onBack={() => { if (draft.confirmLeave()) router.push("/admin/ideas") }}
        onEdit={beginEditing} onModeChange={switchMode} onCancel={cancel}>
        <Button type="button" size="sm" onClick={save} disabled={locked || !draft.dirty}>保存 Idea</Button>
      </DocumentActionBar>

      {draft.recovery && <DraftRecoveryNotice
        onRestore={() => { draft.restore(); setError(""); switchMode("edit") }}
        onDiscard={() => { draft.discardRecovery(); setError("") }} />}
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {draft.storageError && <p role="alert" className="mb-4 text-sm text-destructive">{draft.storageError}</p>}

      {mode !== "edit" && (
        <article className="mx-auto min-w-0 max-w-3xl" aria-label={mode === "read" ? "Idea 阅读" : "Idea 预览"}
          id={mode === "preview" ? "document-preview" : undefined}>
          <header className="mb-8 space-y-4 border-b border-border/60 pb-6">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />私人 Idea</p>
            <h1 className="break-words text-2xl font-semibold leading-tight sm:text-3xl">
              {mode === "read" ? savedIdea?.title : data.title || "未命名 Idea"}
            </h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {(mode === "read" ? savedIdea?.tags ?? [] : data.tags.split(",").map((tag) => tag.trim()).filter(Boolean))
                .map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-1">{"#" + tag}</span>)}
              {(mode === "read" ? savedIdea?.projects ?? [] : projects.filter((project) => data.projectIds.includes(project.id)))
                .map((project) => <span key={project.id} className="rounded-md border border-border px-2 py-1">{project.title}</span>)}
            </div>
          </header>
          <IdeaContent content={mode === "read" ? savedIdea?.content ?? "" : data.content} />
        </article>
      )}

      <div id="document-edit" hidden={mode !== "edit"} inert={locked} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="idea-title">标题</Label>
          <Input id="idea-title" value={data.title} onChange={(event) => draft.update({ ...data, title: event.target.value })}
            placeholder="Idea 标题" maxLength={400} className="text-lg" disabled={locked} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="idea-content">正文</Label>
          <Textarea ref={editorRef} id="idea-content" value={data.content}
            onChange={(event) => draft.update({ ...data, content: event.target.value })}
            placeholder="记录想法、场景和下一步实验…" rows={20} maxLength={200_000}
            className="font-mono leading-relaxed" disabled={locked} />
          <p className="text-xs text-muted-foreground">支持 Markdown；预览不会保存或改写正文。</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="idea-tags">标签（英文逗号分隔）</Label>
          <Input id="idea-tags" value={data.tags} onChange={(event) => draft.update({ ...data, tags: event.target.value })}
            placeholder="学习, 编程, 产品" disabled={locked} />
          <p className="text-xs text-muted-foreground">最多 20 个标签，每个不超过 50 个字符。</p>
        </div>
        <fieldset className="space-y-3" disabled={locked}>
          <legend className="text-sm font-medium">关联项目</legend>
          {projects.length === 0 ? <p className="text-sm text-muted-foreground">当前没有项目。</p> : (
            <div className="grid gap-2 rounded-lg border border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={data.projectIds.includes(project.id)}
                    onChange={() => draft.update({ ...data, projectIds: (
                      data.projectIds.includes(project.id) ? data.projectIds.filter((id) => id !== project.id) : [...data.projectIds, project.id]
                    ).sort() })} className="size-4 rounded border-border" />
                  <span className="min-w-0 truncate">{project.title}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>

      {savedIdea?.sourceInboxItem && (
        <details className="mx-auto mt-8 max-w-3xl rounded-lg border border-border/60 p-4">
          <summary className="cursor-pointer text-sm font-medium">查看来源收件箱原文（只读）</summary>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
            {savedIdea.sourceInboxItem.rawInput}
          </pre>
        </details>
      )}
      {savedIdea && !editing && (
        <details className="mx-auto mt-8 max-w-3xl rounded-lg border border-border/60 p-4">
          <summary className="cursor-pointer text-sm font-medium">更多操作</summary>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">转换前会打开确认表单，不会自动发布或完成内容。</p>
            <IdeaConversionDialog ideaId={savedIdea.id} title={savedIdea.title} content={savedIdea.content}
              tags={savedIdea.tags} projects={projects} />
            <Button type="button" variant="destructive" onClick={remove} disabled={pending}>删除 Idea</Button>
          </div>
        </details>
      )}
    </div>
  )
}
