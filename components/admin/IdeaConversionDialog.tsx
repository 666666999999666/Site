"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, ListTodo } from "lucide-react"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type ConversionTarget = "BLOG" | "TODO"

interface ConversionResult {
  conversionId: string
  targetType: ConversionTarget
  targetId: string
  href: string
}

export function IdeaConversionDialog({
  ideaId,
  ownerId = "local",
  title: ideaTitle,
  content: ideaContent,
  tags: ideaTags,
  projects,
}: {
  ideaId: string
  ownerId?: string
  title: string
  content: string
  tags: string[]
  projects: Project[]
}) {
  const router = useRouter()
  const [target, setTarget] = useState<ConversionTarget | null>(null)
  const [requestKey, setRequestKey] = useState("")
  const [title, setTitle] = useState(ideaTitle)
  const [content, setContent] = useState(ideaContent)
  const [tags, setTags] = useState(ideaTags.join(", "))
  const [projectId, setProjectId] = useState("")
  const [priority, setPriority] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [completionCriteria, setCompletionCriteria] = useState("")
  const [subtasks, setSubtasks] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const retrySnapshots = useRef<Record<string, Record<string, string>>>({})
  const storageKey = (kind: ConversionTarget) => `qz-idea-conversion-v2:${ownerId}:${ideaId}:${kind}`

  function open(nextTarget: ConversionTarget) {
    setTarget(nextTarget)
    // A lost response must retain both identity and exactly the submitted fields.
    const key = storageKey(nextTarget)
    let snapshot = retrySnapshots.current[key]
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || "null")
      if (stored && ["requestKey", "title", "content", "tags", "projectId", "priority", "dueDate", "completionCriteria", "subtasks"]
        .every((field) => typeof stored[field] === "string")) snapshot = stored
    } catch { /* Mounted dialogs still retain their retry snapshot. */ }
    setSubmitted(!!snapshot)
    setRequestKey(snapshot?.requestKey || crypto.randomUUID())
    setTitle(snapshot?.title ?? ideaTitle)
    setContent(snapshot?.content ?? ideaContent)
    setTags(snapshot?.tags ?? ideaTags.join(", "))
    setProjectId(snapshot?.projectId ?? "")
    setPriority(snapshot?.priority ?? "")
    setDueDate(snapshot?.dueDate ?? "")
    setCompletionCriteria(snapshot?.completionCriteria ?? "")
    setSubtasks(snapshot?.subtasks ?? "")
    setError("")
  }

  async function convert() {
    if (!target || !requestKey || pending) return
    if (!title.trim()) {
      setError(target === "BLOG" ? "请输入文章标题" : "请输入任务标题")
      return
    }

    setPending(true)
    setError("")
    try {
      const body = target === "BLOG"
        ? {
            targetType: "BLOG" as const,
            requestKey,
            title,
            content,
            excerpt: null,
            tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
          }
        : {
            targetType: "TODO" as const,
            requestKey,
            title,
            description: content || null,
            projectId: projectId || null,
            priority: priority === "" ? null : Number(priority),
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
            completionCriteria: completionCriteria || null,
            subtasks: subtasks
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => ({ title: item })),
          }
      const key = storageKey(target)
      const snapshot = { requestKey, title, content, tags, projectId, priority, dueDate, completionCriteria, subtasks }
      retrySnapshots.current[key] = snapshot
      try { sessionStorage.setItem(key, JSON.stringify(snapshot)) } catch { /* In-memory retry remains safe. */ }
      setSubmitted(true)
      const result = await apiRequest<ConversionResult>(
        `/api/ideas/${ideaId}/conversions`,
        jsonRequest("POST", body),
        (message, status) => Object.assign(new Error(message), { status })
      )
      delete retrySnapshots.current[storageKey(target)]
      try { sessionStorage.removeItem(storageKey(target)) } catch { /* Navigation remains usable. */ }
      setTarget(null)
      router.push(result.href)
      router.refresh()
    } catch (caught) {
      const status = (caught as {status?: number})?.status
      if (status && [400, 401, 403, 404, 422].includes(status)) {
        delete retrySnapshots.current[storageKey(target)]
        try { sessionStorage.removeItem(storageKey(target)) } catch { /* Retry stays local. */ }
        setSubmitted(false)
      }
      setError(caught instanceof Error ? caught.message : "转换失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => open("BLOG")}>
          <FileText className="size-4" /> 转为博客草稿
        </Button>
        <Button type="button" variant="outline" onClick={() => open("TODO")}>
          <ListTodo className="size-4" /> 转为 Todo
        </Button>
      </div>

      <Dialog open={target !== null} onOpenChange={(openState) => {
        if (!openState && !pending) setTarget(null)
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{target === "BLOG" ? "确认创建博客草稿" : "确认创建 Todo"}</DialogTitle>
            <DialogDescription>
              请先检查并修改以下内容。只有点击确认后才会创建正式记录。
            </DialogDescription>
          </DialogHeader>

          {submitted && <p className="text-sm text-muted-foreground">保留上次提交的内容。重试只核对同一请求，不会重复创建；确认成功后可在目标页继续编辑。</p>}
          <fieldset disabled={pending || submitted} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conversion-title">标题</Label>
              <Input
                id="conversion-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={target === "TODO" ? 600 : 400}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conversion-content">{target === "BLOG" ? "文章正文" : "任务描述"}</Label>
              <Textarea
                id="conversion-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={10}
                maxLength={200_000}
              />
            </div>

            {target === "BLOG" ? (
              <div className="space-y-2">
                <Label htmlFor="conversion-tags">标签（英文逗号分隔）</Label>
                <Input
                  id="conversion-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="学习, 编程"
                />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="conversion-project">所属项目</Label>
                    <select
                      id="conversion-project"
                      value={projectId}
                      onChange={(event) => setProjectId(event.target.value)}
                      className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
                    >
                      <option value="">未设置</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conversion-priority">优先级</Label>
                    <select
                      id="conversion-priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                      className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
                    >
                      <option value="">未设置</option>
                      <option value="0">普通</option>
                      <option value="1">重要</option>
                      <option value="2">紧急</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conversion-due">截止时间</Label>
                  <Input
                    id="conversion-due"
                    type="datetime-local"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conversion-criteria">完成标准</Label>
                  <Textarea
                    id="conversion-criteria"
                    value={completionCriteria}
                    onChange={(event) => setCompletionCriteria(event.target.value)}
                    rows={3}
                    maxLength={10_000}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conversion-subtasks">子任务（每行一项）</Label>
                  <Textarea
                    id="conversion-subtasks"
                    value={subtasks}
                    onChange={(event) => setSubtasks(event.target.value)}
                    rows={4}
                  />
                </div>
              </>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={convert} disabled={pending}>
              {pending ? "创建中…" : submitted ? "重试原请求" : target === "BLOG" ? "确认创建草稿" : "确认创建 Todo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
