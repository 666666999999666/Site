"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Project } from "@/lib/generated/prisma/client"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN")
}

export function ProjectsTable({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function del(id: string) {
    if (!confirm("确认删除此项目？此操作不可撤销。")) return
    startTransition(async () => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" })
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id))
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-normal text-muted-foreground">标题</th>
            <th className="text-left p-3 font-normal text-muted-foreground">标签</th>
            <th className="text-left p-3 font-normal w-32 text-muted-foreground">创建时间</th>
            <th className="p-3 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 ? (
            <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">还没有项目</td></tr>
          ) : (
            projects.map((p) => (
              <tr key={p.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-3">
                  <Link href={`/admin/projects/${p.id}`} className="hover:text-foreground">{p.title}</Link>
                </td>
                <td className="p-3 text-muted-foreground">
                  <div className="flex flex-wrap gap-1">
                    {p.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Link href={`/admin/projects/${p.id}`}>
                      <Button variant="ghost" size="sm" className="hover:bg-muted">编辑</Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => del(p.id)} disabled={pending} className="hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
