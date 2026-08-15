"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, Search, Trash2 } from "lucide-react"
import type { Category, Post } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { CategoryManager } from "./CategoryManager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PostWithCategory = Post & { category: Category | null }

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
}

export function PostsList({
  initialPosts,
  categories: initialCategories,
}: {
  initialPosts: PostWithCategory[]
  categories: Category[]
}) {
  const [query, setQuery] = useState("")
  const [posts, setPosts] = useState(initialPosts)
  const [categories, setCategories] = useState(initialCategories)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function search() {
    setPending(true)
    setError("")
    try {
      const data = await apiRequest<PostWithCategory[]>(
        `/api/posts?q=${encodeURIComponent(query)}`
      )
      setPosts(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "搜索失败")
    } finally {
      setPending(false)
    }
  }

  async function removePost(post: Post) {
    if (!window.confirm(`删除“${post.title}”？此操作不可撤销。`)) return
    setPending(true)
    setError("")
    try {
      await apiRequest(`/api/posts/${post.id}`, jsonRequest("DELETE", {}))
      setPosts((current) => current.filter((item) => item.id !== post.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除文章失败")
    } finally {
      setPending(false)
    }
  }

  async function createCategory(name: string) {
    const category = await apiRequest<Category>(
      "/api/categories",
      jsonRequest("POST", {
        name,
        type: "BLOG",
        sortOrder: (categories.at(-1)?.sortOrder ?? -10) + 10,
      })
    )
    setCategories((current) => [...current, category].sort((a, b) => a.sortOrder - b.sortOrder))
  }

  async function updateCategory(id: string, input: { name: string; sortOrder: number }) {
    const category = await apiRequest<Category>(
      `/api/categories/${id}`,
      jsonRequest("PATCH", input)
    )
    setCategories((current) => current
      .map((item) => item.id === id ? category : item)
      .sort((a, b) => a.sortOrder - b.sortOrder))
    setPosts((current) => current.map((post) => (
      post.categoryId === id ? { ...post, category } : post
    )))
  }

  async function deleteCategory(id: string) {
    await apiRequest(`/api/categories/${id}`, { method: "DELETE" })
    setCategories((current) => current.filter((item) => item.id !== id))
    setPosts((current) => current.map((post) => (
      post.categoryId === id ? { ...post, categoryId: null, category: null } : post
    )))
    if (activeGroupId === id) setActiveGroupId(null)
  }

  const filteredPosts = activeGroupId
    ? posts.filter((post) => post.categoryId === activeGroupId)
    : posts

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-52">
        <h2 className="mb-2 px-3 text-sm font-medium text-muted-foreground">分区</h2>
        <CategoryManager
          groups={categories}
          activeGroupId={activeGroupId}
          itemLabel="文章"
          disabled={pending}
          onSelect={setActiveGroupId}
          onCreate={createCategory}
          onUpdate={updateCategory}
          onDelete={deleteCategory}
        />
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索标题或内容"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void search()
              }}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={search}
            disabled={pending}
            aria-label="搜索文章"
          >
            <Search className="size-4" />
          </Button>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {filteredPosts.length === 0 ? (
          <p className="rounded-lg border border-border/50 p-8 text-center text-sm text-muted-foreground xl:hidden">
            还没有文章
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/50 xl:hidden">
            {filteredPosts.map((post) => (
              <li key={post.id} className="flex min-w-0 items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/posts/${post.id}`}
                    className="block break-words font-medium hover:underline"
                  >
                    {post.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{post.category?.name || "无分区"}</span>
                    <span>{post.status === "PUBLISHED" ? "已发布" : "草稿"}</span>
                    <span>{formatDate(post.updatedAt)}</span>
                  </div>
                </div>
                <Link
                  href={`/admin/posts/${post.id}`}
                  aria-label={`编辑文章 ${post.title}`}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                >
                  <Pencil className="size-4" />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removePost(post)}
                  disabled={pending}
                  aria-label={`删除文章 ${post.title}`}
                  className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="hidden w-full max-w-full overflow-x-auto rounded-lg border border-border/50 xl:block">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left font-normal text-muted-foreground">标题</th>
                <th className="w-28 p-3 text-left font-normal text-muted-foreground">分区</th>
                <th className="w-24 p-3 text-left font-normal text-muted-foreground">状态</th>
                <th className="w-28 p-3 text-left font-normal text-muted-foreground">最后更新</th>
                <th className="w-16 p-3"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">还没有文章</td>
                </tr>
              ) : filteredPosts.map((post) => (
                <tr key={post.id} className="border-t border-border/50 transition-colors hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={`/admin/posts/${post.id}`} className="font-medium hover:underline">
                      {post.title}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{post.category?.name || "无"}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      post.status === "PUBLISHED"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-amber-500/10 text-amber-600"
                    }`}>
                      {post.status === "PUBLISHED" ? "已发布" : "草稿"}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(post.updatedAt)}</td>
                  <td className="p-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePost(post)}
                      disabled={pending}
                      aria-label={`删除文章 ${post.title}`}
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
