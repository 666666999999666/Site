"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { Todo, Category, TodoStatus } from "@/lib/generated/prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type TodoWithCategory = Todo & { category: Category | null }

export function TodoList({
  todos,
  categories,
}: {
  todos: TodoWithCategory[]
  categories: Category[]
}) {
  const router = useRouter()
  const [newTitle, setNewTitle] = useState("")
  const [newCategoryId, setNewCategoryId] = useState<string>(categories[0]?.id || "")
  const [pending, startTransition] = useTransition()

  async function add() {
    if (!newTitle.trim()) return
    startTransition(async () => {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, categoryId: newCategoryId }),
      })
      setNewTitle("")
      router.refresh()
    })
  }

  async function toggle(id: string, current: TodoStatus) {
    startTransition(async () => {
      await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: current === "TODO" ? "DONE" : "TODO" }),
      })
      router.refresh()
    })
  }

  async function del(id: string) {
    startTransition(async () => {
      await fetch(`/api/todos/${id}`, { method: "DELETE" })
      router.refresh()
    })
  }

  // 按分区分组
  const grouped = categories.map((c) => ({
    category: c,
    items: todos.filter((t) => t.categoryId === c.id),
  }))
  const uncategorized = todos.filter((t) => !t.categoryId)

  return (
    <div className="space-y-8">
      {/* 添加新任务 */}
      <div className="flex gap-2">
        <Input
          placeholder="添加新任务…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <select
          value={newCategoryId}
          onChange={(e) => setNewCategoryId(e.target.value)}
          className="border border-line rounded-md px-3 text-sm bg-card"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button onClick={add} disabled={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 分区列表 */}
      {grouped.map(({ category, items }) => (
        <div key={category.id}>
          <h3 className="text-lg font-serif text-ink mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: category.color || "#C97B3D" }} />
            {category.name}
          </h3>
          <ul className="space-y-1 ml-4">
            {items.length === 0 ? (
              <li className="text-sm text-ink-muted py-2">—</li>
            ) : (
              items.map((t) => (
                <TodoItem key={t.id} todo={t} onToggle={toggle} onDelete={del} disabled={pending} />
              ))
            )}
          </ul>
        </div>
      ))}

      {uncategorized.length > 0 && (
        <div>
          <h3 className="text-lg font-serif text-ink mb-3">未分类</h3>
          <ul className="space-y-1 ml-4">
            {uncategorized.map((t) => (
              <TodoItem key={t.id} todo={t} onToggle={toggle} onDelete={del} disabled={pending} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  disabled,
}: {
  todo: Todo
  onToggle: (id: string, s: TodoStatus) => void
  onDelete: (id: string) => void
  disabled: boolean
}) {
  const done = todo.status === "DONE"
  return (
    <li className="flex items-center gap-3 py-2 group">
      <button
        onClick={() => onToggle(todo.id, todo.status)}
        disabled={disabled}
        className={cn(
          "h-5 w-5 rounded border flex items-center justify-center transition-colors",
          done ? "bg-accent border-accent text-white" : "border-line hover:border-accent"
        )}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <span className={cn("flex-1", done && "line-through text-ink-muted")}>{todo.title}</span>
      <button
        onClick={() => onDelete(todo.id)}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-4 w-4 text-ink-muted hover:text-red-500" />
      </button>
    </li>
  )
}
