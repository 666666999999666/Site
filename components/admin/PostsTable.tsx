"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Post, Category } from "@/lib/generated/prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2, Search } from "lucide-react"

type PostWithCategory = Post & { category: Category | null }

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN")
}

export function PostsTable({ initialPosts }: { initialPosts: PostWithCategory[] }) {
  const [q, setQ] = useState("")
  const [posts, setPosts] = useState(initialPosts)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function search() {
    startTransition(async () => {
      const res = await fetch(`/api/posts?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setPosts(data)
      }
    })
  }

  async function del(id: string) {
    if (!confirm("确认删除？此操作不可撤销。")) return
    startTransition(async () => {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" })
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id))
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <Input
            placeholder="搜索标题或内容…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-ink-muted">
            <tr>
              <th className="text-left p-3 font-normal">标题</th>
              <th className="text-left p-3 font-normal w-24">分区</th>
              <th className="text-left p-3 font-normal w-24">状态</th>
              <th className="text-left p-3 font-normal w-32">时间</th>
              <th className="p-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-ink-muted">还没有文章</td></tr>
            ) : (
              posts.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-3">
                    <Link href={`/admin/posts/${p.id}`} className="hover:text-accent">{p.title}</Link>
                  </td>
                  <td className="p-3 text-ink-muted">{p.category?.name || "—"}</td>
                  <td className="p-3">
                    <span className={p.status === "PUBLISHED" ? "text-accent" : "text-ink-muted"}>
                      {p.status === "PUBLISHED" ? "已发布" : "草稿"}
                    </span>
                  </td>
                  <td className="p-3 text-ink-muted">{formatDate(p.createdAt)}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" onClick={() => del(p.id)} disabled={pending}>
                      <Trash2 className="h-4 w-4 text-ink-muted hover:text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
