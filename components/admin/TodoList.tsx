"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { Todo, Category, TodoStatus } from "@/lib/generated/prisma/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { TodoGroupManager } from "./TodoGroupManager"

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
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function add() {
    if (!newTitle.trim()) return
    startTransition(async () => {
      await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, categoryId: newCategoryId || null }),
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

  async function createGroup(name: string) {
    startTransition(async () => {
      await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "TODO" }),
      })
      router.refresh()
    })
  }

  async function renameGroup(id: string, name: string) {
    startTransition(async () => {
      await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      router.refresh()
    })
  }

  async function deleteGroup(id: string) {
    startTransition(async () => {
      await fetch(`/api/categories/${id}`, { method: "DELETE" })
      if (activeGroupId === id) setActiveGroupId(null)
      router.refresh()
    })
  }

  // 按选中分区过滤
  const filteredTodos = activeGroupId
    ? todos.filter((t) => t.categoryId === activeGroupId)
    : todos

  return (
    <div className="flex gap-6">
      {/* 左侧分区管理 */}
      <div className="w-48 shrink-0">
        <h3 className="text-sm font-medium text-muted-foreground mb-2 px-3">分区</h3>
        <TodoGroupManager
          groups={categories}
          activeGroupId={activeGroupId}
          onSelect={setActiveGroupId}
          onCreate={createGroup}
          onRename={renameGroup}
          onDelete={deleteGroup}
        />
      </div>

      {/* 右侧任务列表 */}
      <div className="flex-1 space-y-4">
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
            className="border border-border/50 rounded-md px-3 text-sm bg-background"
          >
            <option value="">无分区</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Button onClick={add} disabled={pending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* 任务列表 */}
        {filteredTodos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">暂无任务</p>
        ) : (
          <ul className="space-y-1">
            {filteredTodos.map((t) => (
              <TodoItem key={t.id} todo={t} onToggle={toggle} onDelete={del} disabled={pending} />
            ))}
          </ul>
        )}
      </div>
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
          done ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"
        )}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <span className={cn("flex-1", done && "line-through text-muted-foreground")}>{todo.title}</span>
      <button
        onClick={() => onDelete(todo.id)}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </button>
    </li>
  )
}
