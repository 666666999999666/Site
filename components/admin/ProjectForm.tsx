"use client"

import Image from "next/image"
import { useRef, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter()
  const [title, setTitle] = useState(project?.title || "")
  const [description, setDescription] = useState(project?.description || "")
  const [tags, setTags] = useState((project?.tags || []).join(", "))
  const [coverImage, setCoverImage] = useState(project?.coverImage || "")
  const [sourceUrl, setSourceUrl] = useState(project?.sourceUrl || "")
  const [demoUrl, setDemoUrl] = useState(project?.demoUrl || "")
  const [sortOrder, setSortOrder] = useState(project?.sortOrder ?? 0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const unsavedCoverRef = useRef<string | null>(null)

  async function removeUnsavedCover() {
    const url = unsavedCoverRef.current
    if (!url) return
    unsavedCoverRef.current = null
    await apiRequest("/api/upload", jsonRequest("DELETE", { url })).catch(() => undefined)
  }

  async function uploadCover(file: File) {
    setPending(true)
    setError("")
    try {
      await removeUnsavedCover()
      const form = new FormData()
      form.append("file", file)
      const payload = await apiRequest<{ url: string }>("/api/upload", {
        method: "POST",
        body: form,
      })
      unsavedCoverRef.current = payload.url
      setCoverImage(payload.url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "封面上传失败")
    } finally {
      setPending(false)
    }
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
        description: description || null,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        coverImage: coverImage || null,
        sourceUrl: sourceUrl || null,
        demoUrl: demoUrl || null,
        sortOrder,
      }
      await apiRequest(
        project ? `/api/projects/${project.id}` : "/api/projects",
        jsonRequest(project ? "PATCH" : "POST", body)
      )
      unsavedCoverRef.current = null
      router.push("/admin/projects")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      setPending(false)
    }
  }

  async function cancel() {
    await removeUnsavedCover()
    router.push("/admin/projects")
  }

  async function removeProject() {
    if (!project || !window.confirm(`删除“${project.title}”？此操作不可撤销。`)) return
    setPending(true)
    setError("")
    try {
      await apiRequest(`/api/projects/${project.id}`, { method: "DELETE" })
      await removeUnsavedCover()
      router.push("/admin/projects")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="项目标题"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">项目说明</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="说明解决的问题、你的实现和可验证结果"
          maxLength={5000}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">标签（逗号分隔）</Label>
        <Input
          id="tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="Next.js, TypeScript, Prisma"
        />
      </div>

      <div className="space-y-3">
        <Label htmlFor="cover">项目封面（可选）</Label>
        {coverImage && (
          <div className="overflow-hidden rounded-lg border border-border">
            <Image
              src={coverImage}
              alt="项目封面预览"
              width={1600}
              height={700}
              className="aspect-[16/7] w-full object-cover"
              unoptimized
            />
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cover"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadCover(file)
              event.target.value = ""
            }}
            disabled={pending}
          />
          {coverImage && (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await removeUnsavedCover()
                setCoverImage("")
              }}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              移除封面
            </Button>
          )}
        </div>
        {!coverImage && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImagePlus className="size-3.5" />
            JPG、PNG、GIF 或 WebP，最大 5MB
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sourceUrl">源码链接（可选）</Label>
          <Input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://github.com/..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="demoUrl">在线演示（可选）</Label>
          <Input
            id="demoUrl"
            type="url"
            value={demoUrl}
            onChange={(event) => setDemoUrl(event.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sortOrder">排序值（越小越靠前）</Label>
        <Input
          id="sortOrder"
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          min={-10_000}
          max={10_000}
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {project ? (
          <Button
            type="button"
            variant="destructive"
            onClick={removeProject}
            disabled={pending}
          >
            删除项目
          </Button>
        ) : <span />}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={cancel} disabled={pending}>取消</Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  )
}
