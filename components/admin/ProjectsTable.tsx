"use client"

import { useState } from "react"
import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"
import type { Project } from "@/lib/generated/prisma/client"
import { apiRequest } from "@/lib/api-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
}

export function ProjectsTable({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function remove(project: Project) {
    if (!window.confirm(`删除“${project.title}”？此操作不可撤销。`)) return
    setPending(true)
    setError("")
    try {
      await apiRequest(`/api/projects/${project.id}`, { method: "DELETE" })
      setProjects((current) => current.filter((item) => item.id !== project.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {projects.length === 0 ? (
        <p className="rounded-lg border border-border/50 p-8 text-center text-sm text-muted-foreground xl:hidden">
          还没有项目
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border/50 xl:hidden">
          {projects.map((project) => (
            <li key={project.id} className="flex min-w-0 items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/projects/${project.id}`}
                  className="block break-words font-medium hover:underline"
                >
                  {project.title}
                </Link>
                <div className="mt-2 flex flex-wrap gap-1">
                  {project.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  排序 {project.sortOrder} · 更新于 {formatDate(project.updatedAt)}
                </p>
              </div>
              <Link
                href={`/admin/projects/${project.id}`}
                className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
                aria-label={`编辑项目 ${project.title}`}
              >
                <Pencil className="size-4" />
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(project)}
                disabled={pending}
                aria-label={`删除项目 ${project.title}`}
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
              <th className="p-3 text-left font-normal text-muted-foreground">标签</th>
              <th className="w-20 p-3 text-left font-normal text-muted-foreground">排序</th>
              <th className="w-28 p-3 text-left font-normal text-muted-foreground">最后更新</th>
              <th className="w-28 p-3"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">还没有项目</td></tr>
            ) : projects.map((project) => (
              <tr key={project.id} className="border-t border-border/50 transition-colors hover:bg-muted/30">
                <td className="p-3">
                  <Link href={`/admin/projects/${project.id}`} className="font-medium hover:underline">
                    {project.title}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground">
                  <div className="flex flex-wrap gap-1">
                    {project.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">{project.sortOrder}</td>
                <td className="p-3 text-muted-foreground">{formatDate(project.updatedAt)}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                      aria-label={`编辑项目 ${project.title}`}
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(project)}
                      disabled={pending}
                      aria-label={`删除项目 ${project.title}`}
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
  )
}
