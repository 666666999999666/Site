"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { Post, Category } from "@/lib/generated/prisma/client"
import { PostEditor } from "./PostEditor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type PostWithCategory = Post & { category: Category | null }

export function PostForm({
  post,
  categories,
}: {
  post?: PostWithCategory
  categories: Category[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState(post?.title || "")
  const [content, setContent] = useState(post?.content || "")
  const [excerpt, setExcerpt] = useState(post?.excerpt || "")
  const [categoryId, setCategoryId] = useState(post?.categoryId || "")
  const [tags, setTags] = useState((post?.tags || []).join(", "))
  const [publishedAt, setPublishedAt] = useState(
    post?.publishedAt ? new Date(post.publishedAt).toISOString().slice(0, 16) : ""
  )
  const [pending, startTransition] = useTransition()

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (!title.trim()) {
      alert("请输入标题")
      return
    }
    startTransition(async () => {
      const body = {
        title,
        content,
        excerpt,
        categoryId: categoryId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        status,
        publishedAt: publishedAt || null,
      }
      const url = post ? `/api/posts/${post.id}` : "/api/posts"
      const method = post ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.push("/admin/posts")
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || "保存失败")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文章标题" className="text-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>分区</Label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-border/50 rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">无分区</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">标签（逗号分隔）</Label>
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="技术, 学习" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="publishedAt">发布时间</Label>
        <Input
          id="publishedAt"
          type="datetime-local"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">摘要（可选）</Label>
        <Textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
      </div>

      <div className="space-y-2">
        <Label>正文</Label>
        <PostEditor value={content} onChange={setContent} />
      </div>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => save("DRAFT")} disabled={pending}>存为草稿</Button>
        <Button onClick={() => save("PUBLISHED")} disabled={pending}>{post?.status === "PUBLISHED" ? "更新发布" : "发布"}</Button>
      </div>
    </div>
  )
}
