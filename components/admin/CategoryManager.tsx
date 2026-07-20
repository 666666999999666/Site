"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { Category, CategoryType } from "@/lib/generated/prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"

export function CategoryManager({
  categories,
  type,
}: {
  categories: Category[]
  type: CategoryType
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()
  const filtered = categories.filter((c) => c.type === type)

  async function add() {
    if (!name.trim()) return
    startTransition(async () => {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      })
      setName("")
      router.refresh()
    })
  }

  async function del(id: string) {
    if (!confirm("删除分区？分区下文章/Todo 的分区会置空")) return
    startTransition(async () => {
      await fetch(`/api/categories/${id}`, { method: "DELETE" })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="分区名…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} disabled={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ul className="space-y-1">
        {filtered.length === 0 ? (
          <li className="text-sm text-ink-muted">还没有分区</li>
        ) : (
          filtered.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-1.5 group">
              <span className="w-2 h-2 rounded-full" style={{ background: c.color || "#C97B3D" }} />
              <span className="flex-1">{c.name}</span>
              <button onClick={() => del(c.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-4 w-4 text-ink-muted hover:text-red-500" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
