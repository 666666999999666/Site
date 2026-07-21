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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索标题或内容…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-normal text-muted-foreground">标题</th>
              <th className="text-left p-3 font-normal w-24 text-muted-foreground">分区</th>
              <th className="text-left p-3 font-normal w-24 text-muted-foreground">状态</th>
              <th className="text-left p-3 font-normal w-32 text-muted-foreground">时间</th>
              <th className="p-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">还没有文章</td></tr>
            ) : (
              posts.map((p) => (
                <tr key={p.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <Link href={`/admin/posts/${p.id}`} className="hover:text-foreground">{p.title}</Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{p.category?.name || "—"}</td>
                  <td className="p-3">
                    {p.status === "PUBLISHED" ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-600">
                        已发布
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-600">
                        草稿
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" onClick={() => del(p.id)} disabled={pending} className="hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
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
