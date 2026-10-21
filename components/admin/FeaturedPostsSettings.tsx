"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { MAX_FEATURED_POSTS, type FeaturedPostOption, type FeaturedPostsAdminState } from "@/lib/featured-posts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FeaturedPostsSettings() {
  const router = useRouter()
  const [selected, setSelected] = useState<FeaturedPostOption[]>([])
  const [candidates, setCandidates] = useState<FeaturedPostOption[]>([])
  const [query, setQuery] = useState("")
  const [ready, setReady] = useState(false)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const saveLock = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<FeaturedPostsAdminState>("/api/settings/featured-posts", { signal: controller.signal })
      .then((state) => {
        setSelected(state.selected)
        setCandidates(state.candidates)
        setReady(true)
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "加载失败，请刷新重试")
      })
    return () => controller.abort()
  }, [])

  function changeSelection(next: FeaturedPostOption[]) {
    setSelected(next)
    setFeedback("")
    setError("")
  }

  function move(index: number, offset: number) {
    const next = [...selected]
    const target = index + offset
    if (target < 0 || target >= next.length) return
    const moving = next[index]
    next[index] = next[target]
    next[target] = moving
    changeSelection(next)
  }

  async function search(event: React.FormEvent) {
    event.preventDefault()
    setSearching(true)
    setError("")
    try {
      const state = await apiRequest<FeaturedPostsAdminState>(`/api/settings/featured-posts?q=${encodeURIComponent(query.trim())}`)
      setCandidates(state.candidates)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "搜索失败")
    } finally {
      setSearching(false)
    }
  }

  async function save() {
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    setFeedback("")
    setError("")
    try {
      await apiRequest("/api/settings/featured-posts", jsonRequest("PUT", { ids: selected.map((post) => post.id) }))
      setFeedback(selected.length ? "精选已保存" : "精选已清空，首页模块已隐藏")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  const unavailable = selected.some((post) => post.status !== "PUBLISHED")

  return (
    <div className="max-w-2xl space-y-5" aria-busy={!ready || saving}>
      <p className="text-sm text-muted-foreground">选择最多 3 篇已发布文章，按下方顺序显示在首页“从这里开始读”。未选择时隐藏整个模块；不会修改文章内容。</p>
      {!ready && !error && <p role="status" className="text-sm text-muted-foreground">正在加载精选设置…</p>}
      <ol aria-label="已选精选文章" className="space-y-3">
        {selected.map((post, index) => (
          <li key={post.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <span className="min-w-0 flex-1 basis-48 break-words text-sm">{index + 1}. {post.title}{post.status !== "PUBLISHED" && <span className="ml-2 text-destructive">（{post.status === "MISSING" ? "已删除" : "未发布"}，不会公开展示）</span>}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={saving || index === 0} aria-label={`上移 ${post.title}`} onClick={() => move(index, -1)}>上移</Button>
              <Button type="button" variant="outline" disabled={saving || index === selected.length - 1} aria-label={`下移 ${post.title}`} onClick={() => move(index, 1)}>下移</Button>
              <Button type="button" variant="outline" disabled={saving} aria-label={`取消精选 ${post.title}`} onClick={() => changeSelection(selected.filter((item) => item.id !== post.id))}>取消精选</Button>
            </div>
          </li>
        ))}
      </ol>
      {ready && !selected.length && <p className="text-sm text-muted-foreground">尚未选择精选文章，首页模块隐藏。</p>}
      <form onSubmit={search} className="space-y-3">
        <Label htmlFor="featured-post-query">搜索已发布文章标题</Label>
        <div className="flex gap-2">
          <Input id="featured-post-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} disabled={!ready || saving || searching} />
          <Button type="submit" variant="outline" disabled={!ready || saving || searching}>{searching ? "搜索中…" : "搜索"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">每次最多列出 30 篇，可输入标题查找；选择后点击“保存精选”才生效。</p>
        <ul aria-label="可选已发布文章" className="max-h-64 space-y-2 overflow-y-auto">
          {candidates.map((post) => {
            const isSelected = selected.some((item) => item.id === post.id)
            return (
              <li key={post.id} className="flex items-center gap-3 rounded border border-border/60 p-2">
                <span className="min-w-0 flex-1 break-words text-sm">{post.title}</span>
                <Button type="button" variant="outline" disabled={saving || isSelected || selected.length >= MAX_FEATURED_POSTS} aria-label={`精选 ${post.title}`} onClick={() => changeSelection([...selected, post])}>{isSelected ? "已选择" : "选择"}</Button>
              </li>
            )
          })}
        </ul>
        {ready && !candidates.length && <p className="text-sm text-muted-foreground">没有匹配的已发布文章。</p>}
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!ready || saving || unavailable} onClick={save}>{saving ? "保存中…" : "保存精选"}</Button>
        <Button type="button" variant="outline" disabled={!ready || saving || !selected.length} onClick={() => changeSelection([])}>清空选择</Button>
        {feedback && <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{feedback}</span>}
      </div>
      {unavailable && <p className="text-sm text-muted-foreground">请取消已删除或未发布的文章后保存。</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
