"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { Check, ChevronDown, FilePlus2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import type { Category, Post, Todo } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { CategoryManager } from "./CategoryManager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type TodoWithCategory = Todo & { category: Category | null }
type StatusFilter = "TODO" | "DONE" | "ALL"

// #29: 用 useSyncExternalStore 在 hydration 后读取 localStorage 记住的新建分类，
// 避免 useState 初始化访问 localStorage 导致 hydration mismatch，
// 也避免 useEffect 里 setState 触发 react-hooks/set-state-in-effect lint。
const TODO_CATEGORY_EVENT = "qz-todo-category-change"

function subscribeToTodoCategory(callback: () => void) {
  window.addEventListener(TODO_CATEGORY_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(TODO_CATEGORY_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

function getTodoCategorySnapshot(): string {
  return localStorage.getItem("qz-todo-category") ?? ""
}

function getTodoCategoryServerSnapshot(): string {
  return ""
}

function dueDateInput(value: Date | string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function dueDateIso(value: string): string | null {
  if (!value) return null
  return new Date(`${value}T12:00:00`).toISOString()
}

function priorityLabel(priority: number) {
  if (priority === 2) return "紧急"
  if (priority === 1) return "重要"
  return "普通"
}

export function TodoList({
  todos: initialTodos,
  categories: initialCategories,
}: {
  todos: TodoWithCategory[]
  categories: Category[]
}) {
  const [todos, setTodos] = useState(initialTodos)
  const [categories, setCategories] = useState(initialCategories)
  const [newTitle, setNewTitle] = useState("")
  // #29: newCategoryId 由 useSyncExternalStore 派生，hydration 后自动用 localStorage 值
  const rememberedCategory = useSyncExternalStore(
    subscribeToTodoCategory,
    getTodoCategorySnapshot,
    getTodoCategoryServerSnapshot,
  )
  const newCategoryId =
    rememberedCategory && initialCategories.some((category) => category.id === rememberedCategory)
      ? rememberedCategory
      : initialCategories[0]?.id || ""
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("TODO")
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  function selectNewCategory(id: string) {
    if (id) localStorage.setItem("qz-todo-category", id)
    else localStorage.removeItem("qz-todo-category")
    window.dispatchEvent(new Event(TODO_CATEGORY_EVENT))
  }

  async function add() {
    if (!newTitle.trim()) return
    setPending(true)
    setError("")
    try {
      const todo = await apiRequest<TodoWithCategory>(
        "/api/todos",
        jsonRequest("POST", {
          title: newTitle,
          categoryId: newCategoryId || null,
        })
      )
      setTodos((current) => [todo, ...current])
      setNewTitle("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加失败")
    } finally {
      setPending(false)
    }
  }

  async function updateTodo(id: string, input: Record<string, unknown>) {
    setPending(true)
    setError("")
    try {
      const updated = await apiRequest<TodoWithCategory>(
        `/api/todos/${id}`,
        jsonRequest("PATCH", input)
      )
      setTodos((current) => current.map((todo) => todo.id === id ? updated : todo))
      return updated
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "更新失败"
      setError(message)
      throw new Error(message)
    } finally {
      setPending(false)
    }
  }

  async function toggle(todo: Todo) {
    await updateTodo(todo.id, {
      status: todo.status === "TODO" ? "DONE" : "TODO",
    }).catch(() => undefined)
  }

  async function remove(todo: Todo) {
    if (!window.confirm(`删除“${todo.title}”？此操作不可撤销。`)) return
    setPending(true)
    setError("")
    try {
      await apiRequest(`/api/todos/${todo.id}`, { method: "DELETE" })
      setTodos((current) => current.filter((item) => item.id !== todo.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败")
    } finally {
      setPending(false)
    }
  }

  async function createDraft(todo: Todo, markDone: boolean) {
    setPending(true)
    setError("")
    try {
      const result = await apiRequest<{ post: Post; todo: TodoWithCategory }>(
        `/api/todos/${todo.id}/draft`,
        jsonRequest("POST", { markDone })
      )
      setTodos((current) => current.map((item) => (
        item.id === todo.id ? result.todo : item
      )))
      router.push(`/admin/posts/${result.post.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建草稿失败")
    } finally {
      setPending(false)
    }
  }

  async function createCategory(name: string) {
    const category = await apiRequest<Category>(
      "/api/categories",
      jsonRequest("POST", {
        name,
        type: "TODO",
        sortOrder: (categories.at(-1)?.sortOrder ?? -10) + 10,
      })
    )
    setCategories((current) => [...current, category].sort((a, b) => a.sortOrder - b.sortOrder))
    selectNewCategory(category.id)
  }

  async function updateCategory(id: string, input: { name: string; sortOrder: number }) {
    const category = await apiRequest<Category>(
      `/api/categories/${id}`,
      jsonRequest("PATCH", input)
    )
    setCategories((current) => current
      .map((item) => item.id === id ? category : item)
      .sort((a, b) => a.sortOrder - b.sortOrder))
    setTodos((current) => current.map((todo) => (
      todo.categoryId === id ? { ...todo, category } : todo
    )))
  }

  async function deleteCategory(id: string) {
    await apiRequest(`/api/categories/${id}`, { method: "DELETE" })
    setCategories((current) => current.filter((category) => category.id !== id))
    setTodos((current) => current.map((todo) => (
      todo.categoryId === id ? { ...todo, categoryId: null, category: null } : todo
    )))
    if (activeGroupId === id) setActiveGroupId(null)
    if (newCategoryId === id) selectNewCategory("")
  }

  const filteredTodos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return todos
      .filter((todo) => !activeGroupId || todo.categoryId === activeGroupId)
      .filter((todo) => statusFilter === "ALL" || todo.status === statusFilter)
      .filter((todo) => {
        if (!normalizedQuery) return true
        return `${todo.title}\n${todo.description || ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "TODO" ? -1 : 1
        if (a.priority !== b.priority) return b.priority - a.priority
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [activeGroupId, query, statusFilter, todos])

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-52">
        <h2 className="mb-2 px-3 text-sm font-medium text-muted-foreground">分区</h2>
        <CategoryManager
          groups={categories}
          activeGroupId={activeGroupId}
          itemLabel="Todo"
          disabled={pending}
          onSelect={setActiveGroupId}
          onCreate={createCategory}
          onUpdate={updateCategory}
          onDelete={deleteCategory}
        />
      </aside>

      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            placeholder="记录一个任务或想法"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) void add()
            }}
            className="min-w-0 flex-1"
            maxLength={300}
          />
          <select
            value={newCategoryId}
            onChange={(event) => selectNewCategory(event.target.value)}
            className="h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm sm:w-36"
            aria-label="新 Todo 分区"
          >
            <option value="">无分区</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <Button type="button" onClick={add} disabled={pending || !newTitle.trim()}>
            <Plus className="size-4" />
            添加
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-md border border-border p-0.5" aria-label="Todo 状态筛选">
            {([
              ["TODO", "未完成"],
              ["DONE", "已完成"],
              ["ALL", "全部"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
                className={cn(
                  "h-8 rounded px-3 text-sm transition-colors",
                  statusFilter === value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题或描述"
              className="pl-9"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {filteredTodos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">当前筛选下没有内容</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/50">
            {filteredTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                categories={categories}
                disabled={pending}
                onToggle={() => toggle(todo)}
                onDelete={() => remove(todo)}
                onSave={(input) => updateTodo(todo.id, input)}
                onCreateDraft={(markDone) => createDraft(todo, markDone)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TodoItem({
  todo,
  categories,
  disabled,
  onToggle,
  onDelete,
  onSave,
  onCreateDraft,
}: {
  todo: TodoWithCategory
  categories: Category[]
  disabled: boolean
  onToggle: () => void
  onDelete: () => void
  onSave: (input: Record<string, unknown>) => Promise<TodoWithCategory>
  onCreateDraft: (markDone: boolean) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(todo.title)
  const [description, setDescription] = useState(todo.description || "")
  const [categoryId, setCategoryId] = useState(todo.categoryId || "")
  const [priority, setPriority] = useState(todo.priority)
  const [dueDate, setDueDate] = useState(dueDateInput(todo.dueDate))
  const [error, setError] = useState("")
  const done = todo.status === "DONE"

  function beginEdit() {
    setTitle(todo.title)
    setDescription(todo.description || "")
    setCategoryId(todo.categoryId || "")
    setPriority(todo.priority)
    setDueDate(dueDateInput(todo.dueDate))
    setError("")
    setEditing(true)
  }

  async function save() {
    if (!title.trim()) {
      setError("标题不能为空")
      return
    }
    try {
      await onSave({
        title,
        description: description || null,
        categoryId: categoryId || null,
        priority,
        dueDate: dueDateIso(dueDate),
      })
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败")
    }
  }

  async function createDraft() {
    if (!window.confirm(`将“${todo.title}”创建为博客草稿？`)) return
    const markDone = !done && window.confirm("创建草稿后，同时将该 Todo 标记为已完成？")
    await onCreateDraft(markDone)
  }

  return (
    <li className="min-w-0 p-3 sm:p-4">
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={`${done ? "标记为未完成" : "标记为已完成"}：${todo.title}`}
          aria-pressed={done}
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border transition-colors",
            done
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:border-primary"
          )}
        >
          {done && <Check className="size-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className={cn("break-words leading-6", done && "text-muted-foreground line-through")}>
            {todo.title}
          </p>
          {todo.description && !editing && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {todo.description}
            </p>
          )}
          {!editing && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {todo.category && <span>{todo.category.name}</span>}
              {todo.priority > 0 && (
                <span className={todo.priority === 2 ? "text-destructive" : "text-amber-600"}>
                  {priorityLabel(todo.priority)}
                </span>
              )}
              {todo.dueDate && (
                <time dateTime={new Date(todo.dueDate).toISOString()}>
                  截止 {new Date(todo.dueDate).toLocaleDateString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </time>
              )}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={createDraft}
          disabled={disabled}
          aria-label={`创建博客草稿：${todo.title}`}
          title="创建博客草稿"
        >
          <FilePlus2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={editing ? () => setEditing(false) : beginEdit}
          disabled={disabled}
          aria-label={`${editing ? "收起编辑" : "编辑"}：${todo.title}`}
        >
          {editing ? <ChevronDown className="size-4" /> : <Pencil className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`删除：${todo.title}`}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {editing && (
        <div className="ml-0 mt-4 space-y-4 border-t border-border pt-4 sm:ml-9">
          <div className="space-y-2">
            <Label htmlFor={`todo-title-${todo.id}`}>标题</Label>
            <Input
              id={`todo-title-${todo.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={300}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`todo-description-${todo.id}`}>描述</Label>
            <Textarea
              id={`todo-description-${todo.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={20_000}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`todo-category-${todo.id}`}>分区</Label>
              <select
                id={`todo-category-${todo.id}`}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">无分区</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`todo-priority-${todo.id}`}>优先级</Label>
              <select
                id={`todo-priority-${todo.id}`}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value={0}>普通</option>
                <option value={1}>重要</option>
                <option value={2}>紧急</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`todo-due-${todo.id}`}>截止日期</Label>
              <Input
                id={`todo-due-${todo.id}`}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
            <Button type="button" onClick={save} disabled={disabled}>保存</Button>
          </div>
        </div>
      )}
    </li>
  )
}
