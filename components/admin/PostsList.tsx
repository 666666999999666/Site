"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { Pencil, Search, Trash2 } from "lucide-react"
import type { Category, Post, Series } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { CategoryManager } from "./CategoryManager"
import { reconcileCategoryItems, useCategories } from "./useCategories"
import { SeriesManager } from "./SeriesManager"
import type { SeriesMutationInput } from "./SeriesManager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  EMPTY_POST_LIST_FILTERS, postDocumentHref, postListHref, postListPositionKey,
  readPostListFilters, readPostListPosition, shouldRestorePostListOnMount, type PostListFilters, type PostListStatus,
} from "@/lib/post-list-navigation"

type PostWithRelations = Post & { category: Category | null; series: Series | null }

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
}

export function PostsList({
  initialPosts,
  categories: initialCategories,
  series: initialSeries,
  initialFilters = EMPTY_POST_LIST_FILTERS,
  ownerId = "local",
}: {
  initialPosts: PostWithRelations[]
  categories: Category[]
  series: Series[]
  initialFilters?: PostListFilters
  ownerId?: string
}) {
  const [query, setQuery] = useState(initialFilters.q)
  const [appliedQuery, setAppliedQuery] = useState(initialFilters.q)
  const initialFiltersRef = useRef(initialFilters)
  const appliedQueryRef = useRef(initialFilters.q)
  const searchSequence = useRef(0)
  const [posts, setPosts] = useState(initialPosts)
  const categoryMutations = useCategories(initialCategories, "BLOG")
  const { categories } = categoryMutations
  const [series, setSeries] = useState(initialSeries)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(initialFilters.categoryId || null)
  const [statusFilter, setStatusFilter] = useState<PostListStatus>(initialFilters.status ?? "ALL")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const listHref = postListHref({ q: appliedQuery, categoryId: activeGroupId ?? "", status: statusFilter })
  const positionKey = postListPositionKey(ownerId, listHref)

  function rememberPosition() {
    if (location.pathname !== "/admin/posts" || postListHref(readPostListFilters(new URLSearchParams(location.search))) !== listHref) return
    try { sessionStorage.setItem(positionKey, String(window.scrollY)) } catch { /* Filters remain in the URL without browser storage. */ }
  }

  function updateLocation(filters: PostListFilters) {
    const query = new URL(postListHref(filters), location.origin).search
    const href = location.pathname + query
    if (href !== location.pathname + location.search) window.history.pushState(null, "", href)
  }

  function selectCategory(id: string | null) {
    if (pending) return
    rememberPosition()
    setActiveGroupId(id)
    updateLocation({ q: appliedQueryRef.current, categoryId: id ?? "", status: statusFilter })
  }

  useLayoutEffect(() => {
    let position = 0
    try { position = readPostListPosition(sessionStorage.getItem(positionKey)) } catch { /* Browser storage may be disabled. */ }
    const frame = requestAnimationFrame(() => window.scrollTo({ top: position, behavior: "instant" }))
    const remember = () => {
      if (location.pathname !== "/admin/posts" || postListHref(readPostListFilters(new URLSearchParams(location.search))) !== listHref) return
      try { sessionStorage.setItem(positionKey, String(window.scrollY)) } catch { /* Keep navigation usable without storage. */ }
    }
    window.addEventListener("scroll", remember, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", remember) }
  }, [listHref, positionKey])

  useEffect(() => {
    const pathname = location.pathname
    const restore = async () => {
      if (location.pathname !== pathname) return
      const filters = readPostListFilters(new URLSearchParams(location.search))
      const sequence = ++searchSequence.current
      setQuery(filters.q)
      setActiveGroupId(filters.categoryId || null)
      setStatusFilter(filters.status ?? "ALL")
      if (filters.q === appliedQueryRef.current) { setPending(false); return }
      setPending(true)
      setError("")
      try {
        const data = await apiRequest<PostWithRelations[]>(`/api/posts?q=${encodeURIComponent(filters.q)}`)
        if (sequence !== searchSequence.current) return
        appliedQueryRef.current = filters.q
        setAppliedQuery(filters.q)
        setPosts(data)
      } catch (caught) {
        if (sequence === searchSequence.current) setError(caught instanceof Error ? caught.message : "搜索失败")
      } finally {
        if (sequence === searchSequence.current) setPending(false)
      }
    }
    // A cached tree may miss popstate before mounting. Restore only that mismatch:
    // replaying an already-resolved URL can erase text typed before this frame.
    const frame = shouldRestorePostListOnMount(initialFiltersRef.current, new URLSearchParams(location.search))
      ? requestAnimationFrame(() => { void restore() })
      : null
    window.addEventListener("popstate", restore)
    return () => { if (frame !== null) cancelAnimationFrame(frame); window.removeEventListener("popstate", restore); searchSequence.current += 1 }
  }, [])

  async function search() {
    if (pending) return
    const sequence = ++searchSequence.current
    setPending(true)
    setError("")
    try {
      const nextQuery = query.trim()
      const data = await apiRequest<PostWithRelations[]>(
        `/api/posts?q=${encodeURIComponent(nextQuery)}`
      )
      if (sequence !== searchSequence.current) return
      rememberPosition()
      appliedQueryRef.current = nextQuery
      setAppliedQuery(nextQuery)
      setPosts(data)
      updateLocation({ q: nextQuery, categoryId: activeGroupId ?? "", status: statusFilter })
    } catch (caught) {
      if (sequence === searchSequence.current) setError(caught instanceof Error ? caught.message : "搜索失败")
    } finally {
      if (sequence === searchSequence.current) setPending(false)
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
    await categoryMutations.createCategory(name)
  }

  async function updateCategory(id: string, input: { name: string; sortOrder: number }) {
    const category = await categoryMutations.updateCategory(id, input)
    setPosts((current) => reconcileCategoryItems(current, id, category))
  }

  async function deleteCategory(id: string) {
    await categoryMutations.deleteCategory(id)
    setPosts((current) => reconcileCategoryItems(current, id, null))
    if (activeGroupId === id) selectCategory(null)
  }

  function sortSeries(items: Series[]) {
    return items.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh-CN"))
  }

  async function createSeries(input: SeriesMutationInput) {
    const item = await apiRequest<Series>("/api/series", jsonRequest("POST", input))
    setSeries((current) => sortSeries([...current, item]))
  }

  async function updateSeries(
    id: string,
    input: SeriesMutationInput
  ) {
    const item = await apiRequest<Series>(`/api/series/${id}`, jsonRequest("PATCH", input))
    setSeries((current) => current
      .map((candidate) => candidate.id === id ? item : candidate)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh-CN")))
    setPosts((current) => current.map((post) => (
      post.seriesId === id ? { ...post, series: item } : post
    )))
  }

  async function deleteSeries(id: string) {
    await apiRequest(`/api/series/${id}`, { method: "DELETE" })
    setSeries((current) => current.filter((item) => item.id !== id))
    setPosts((current) => current.map((post) => (
      post.seriesId === id ? { ...post, seriesId: null, seriesOrder: null, series: null } : post
    )))
  }

  const filteredPosts = posts.filter((post) => (
    (!activeGroupId || post.categoryId === activeGroupId)
    && (statusFilter === "ALL" || post.status === statusFilter)
  ))

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 space-y-7 lg:w-56">
        <section aria-labelledby="post-categories-heading">
          <h2 id="post-categories-heading" className="mb-2 px-3 text-sm font-medium text-muted-foreground">分区</h2>
          <CategoryManager
            groups={categories}
            activeGroupId={activeGroupId}
            itemLabel="文章"
            disabled={pending}
            onSelect={selectCategory}
            onCreate={createCategory}
            onUpdate={updateCategory}
            onDelete={deleteCategory}
          />
        </section>
        <section aria-labelledby="post-series-heading">
          <h2 id="post-series-heading" className="mb-2 px-1 text-sm font-medium text-muted-foreground">系列</h2>
          <SeriesManager
            items={series}
            disabled={pending}
            onCreate={createSeries}
            onUpdate={updateSeries}
            onDelete={deleteSeries}
          />
        </section>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="按文章发布状态筛选">
          {([["ALL", "全部"], ["DRAFT", "草稿"], ["PUBLISHED", "已发布"]] as const).map(([status, label]) => (
            <Button key={status} type="button" variant={statusFilter === status ? "default" : "outline"}
              aria-pressed={statusFilter === status} disabled={pending} onClick={() => {
                rememberPosition()
                setStatusFilter(status)
                updateLocation({ q: appliedQueryRef.current, categoryId: activeGroupId ?? "", status })
              }}>
              {label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索标题或内容"
              aria-label="搜索文章标题或内容"
              disabled={pending}
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
                    href={postDocumentHref(post.id, listHref)}
                    onClick={rememberPosition}
                    className="block break-words font-medium hover:underline"
                  >
                    {post.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{post.category?.name || "无分区"}</span>
                    {post.series && <span>{post.series.title} · {post.seriesOrder ?? 0}</span>}
                    <span>{post.status === "PUBLISHED" ? "已发布" : "草稿"}</span>
                    <span>{formatDate(post.updatedAt)}</span>
                  </div>
                </div>
                <Link
                  href={postDocumentHref(post.id, listHref, true)}
                  onClick={rememberPosition}
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
                <th className="w-36 p-3 text-left font-normal text-muted-foreground">系列</th>
                <th className="w-24 p-3 text-left font-normal text-muted-foreground">状态</th>
                <th className="w-28 p-3 text-left font-normal text-muted-foreground">最后更新</th>
                <th className="w-24 p-3"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">还没有文章</td>
                </tr>
              ) : filteredPosts.map((post) => (
                <tr key={post.id} className="border-t border-border/50 transition-colors hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={postDocumentHref(post.id, listHref)} onClick={rememberPosition} className="font-medium hover:underline">
                      {post.title}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{post.category?.name || "无"}</td>
                  <td className="p-3 text-muted-foreground">
                    {post.series ? `${post.series.title} · ${post.seriesOrder ?? 0}` : "无"}
                  </td>
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
                    <div className="flex items-center gap-1">
                    <Link href={postDocumentHref(post.id, listHref, true)} onClick={rememberPosition}
                      aria-label={`编辑文章 ${post.title}`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-muted">
                      <Pencil className="size-4" />
                    </Link>
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
                    </div>
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
