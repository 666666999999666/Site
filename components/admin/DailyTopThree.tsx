"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  CalendarDays,
  Check,
  Circle,
  Clock3,
  Flame,
  History,
  ListChecks,
  Trash2,
} from "lucide-react"
import type {
  DailyDashboardView,
  DailyMutationView,
  DailyTaskView,
} from "@/lib/daily"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { formatChineseDate } from "@/lib/daily-date"
import { cn } from "@/lib/utils"
import { dailyProgress } from "@/lib/daily-policy"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DailyReviewCard } from "@/components/questions/DailyReviewCard"
import { withTask, changeTaskTitle, selectTaskTodo } from "./daily-task-state"

type SaveState = "idle" | "pending" | "saving" | "saved" | "error"

function feedback(progress: number, selectedCount: number): string {
  if (!selectedCount) return "今天可以不安排，也可以随时选一件想做的事。"
  if (progress === 100) return "今天选的事情已经做完了。"
  return "按自己的节奏来，没做完也可以之后继续。"
}

function saveLabel(state: SaveState): string {
  if (state === "pending") return "待保存"
  if (state === "saving") return "保存中"
  if (state === "saved") return "已保存"
  if (state === "error") return "保存失败"
  return ""
}

export function DailyTopThree({ initialDashboard }: { initialDashboard: DailyDashboardView }) {
  const [day, setDay] = useState(initialDashboard.day)
  const [stats, setStats] = useState(initialDashboard.stats)
  const dayRef = useRef(initialDashboard.day)
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const revisions = useRef<Record<number, number>>({ 1: 0, 2: 0, 3: 0 })
  const pendingTasks = useRef<Record<number, DailyTaskView>>({})
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  function applyTask(task: DailyTaskView) {
    const nextDay = withTask(dayRef.current, task)
    dayRef.current = nextDay
    setDay(nextDay)
  }

  function setSaveState(slot: number, state: SaveState) {
    setSaveStates((current) => ({ ...current, [slot]: state }))
  }

  // Call only after the operation's own stale-revision guard has passed.
  function applySavedTask(result: DailyMutationView, slot: DailyTaskView["slot"]) {
    const savedTask = result.day.tasks.find((item) => item.slot === slot)
    if (savedTask) applyTask(savedTask)
    setStats(result.stats)
    setSaveState(slot, "saved")
  }

  function persist(slot: 1 | 2 | 3, task: DailyTaskView, revision: number) {
    const operation = async () => {
      if (revision !== revisions.current[slot]) return
      setSaveState(slot, "saving")
      setErrors((current) => ({ ...current, [slot]: "" }))
      try {
        const result = await apiRequest<DailyMutationView>(
          `/api/daily/tasks/${slot}`,
          {
            ...jsonRequest("PUT", {
              date: dayRef.current.date,
              title: task.title,
              sourceTodoId: task.sourceTodoId,
              completed: task.completed,
            }),
            keepalive: true,
          }
        )
        if (revision !== revisions.current[slot]) return
        applySavedTask(result, slot)
      } catch (caught) {
        if (revision !== revisions.current[slot]) return
        setSaveState(slot, "error")
        setErrors((current) => ({
          ...current,
          [slot]: caught instanceof Error ? caught.message : "保存失败",
        }))
      }
    }
    saveQueue.current = saveQueue.current.then(operation, operation)
    return saveQueue.current
  }

  function scheduleSave(task: DailyTaskView, immediate = false) {
    const slot = task.slot
    const revision = (revisions.current[slot] ?? 0) + 1
    revisions.current[slot] = revision
    pendingTasks.current[slot] = task
    clearTimeout(timers.current[slot])
    setSaveState(slot, immediate ? "saving" : "pending")
    if (immediate) {
      void persist(slot, task, revision)
      return
    }
    timers.current[slot] = setTimeout(() => void persist(slot, task, revision), 500)
  }

  function flush(slot: 1 | 2 | 3) {
    const task = pendingTasks.current[slot]
    if (!task || saveStates[slot] !== "pending") return
    clearTimeout(timers.current[slot])
    void persist(slot, task, revisions.current[slot])
  }

  function changeTitle(task: DailyTaskView, title: string) {
    const source = initialDashboard.todoOptions.find((todo) => todo.id === task.sourceTodoId)
    const nextTask = changeTaskTitle(task, title, source)
    applyTask(nextTask)
    scheduleSave(nextTask)
  }

  function chooseTodo(task: DailyTaskView, todoId: string) {
    const todo = initialDashboard.todoOptions.find((item) => item.id === todoId)
    const nextTask = selectTaskTodo(task, todo)
    applyTask(nextTask)
    scheduleSave(nextTask, true)
  }

  function toggleTask(task: DailyTaskView) {
    if (!task.title || task.inactive) return
    const nextTask: DailyTaskView = {
      ...task,
      completed: !task.completed,
      completedAt: task.completed ? null : new Date().toISOString(),
    }
    applyTask(nextTask)
    scheduleSave(nextTask, true)
  }

  async function removeTask(task: DailyTaskView) {
    const slot = task.slot
    clearTimeout(timers.current[slot])
    const revision = revisions.current[slot] + 1
    revisions.current[slot] = revision
    const empty: DailyTaskView = {
      id: null,
      slot,
      title: "",
      completed: false,
      completedAt: null,
      sourceTodoId: null,
    }
    applyTask(empty)
    setSaveState(slot, "saving")
    setErrors((current) => ({ ...current, [slot]: "" }))
    const operation = async () => {
      try {
        const result = await apiRequest<DailyMutationView>(
          `/api/daily/tasks/${slot}?date=${encodeURIComponent(day.date)}`,
          { method: "DELETE", keepalive: true }
        )
        if (revision !== revisions.current[slot]) return
        applySavedTask(result, slot)
      } catch (caught) {
        if (revision !== revisions.current[slot]) return
        setSaveState(slot, "error")
        setErrors((current) => ({
          ...current,
          [slot]: caught instanceof Error ? caught.message : "删除失败",
        }))
      }
    }
    saveQueue.current = saveQueue.current.then(operation, operation)
    await saveQueue.current
  }

  const { selectedCount } = dailyProgress(day.tasks)
  const usedTodoIds = new Set(day.tasks.map((task) => task.sourceTodoId).filter(Boolean))

  return (
    <div className="animate-in fade-in duration-300">
      <header className="border-b border-border/60 pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              <time dateTime={day.date}>{formatChineseDate(day.date)}</time>
            </div>
            <h1 className="text-3xl font-semibold">今天想做的事</h1>
          </div>
          <Link
            href="/admin/daily/history"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 self-start px-4 sm:self-auto")}
          >
            <History className="size-4" />
            历史记录
          </Link>
        </div>

        <blockquote className="mt-8 max-w-3xl border-l-2 border-primary/70 pl-5">
          <p className="whitespace-pre-line text-lg leading-8 text-foreground sm:text-xl">{day.quote.quote}</p>
          <footer className="mt-2 text-sm text-muted-foreground">
            {day.quote.category}
            {day.quote.author ? ` · ${day.quote.author}` : ""}
            {day.quote.source ? ` · ${day.quote.source}` : ""}
          </footer>
        </blockquote>
      </header>

      <section className="py-8" aria-labelledby="daily-tasks-heading">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="daily-tasks-heading" className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="size-5" />
            可选 0–3 件，不必填满
          </h2>
          <span className="text-sm tabular-nums text-muted-foreground">{selectedCount ? `${day.completedCount} / ${selectedCount}` : "还没选择"}</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {day.tasks.map((task, index) => (
            <article
              key={task.slot}
              aria-label={`第 ${task.slot} 件事卡片`}
              className={cn(
                "animate-in fade-in slide-in-from-bottom-1 rounded-lg border p-4 duration-300",
                task.completed
                  ? "border-primary/30 bg-primary/[0.04]"
                  : "border-border/70 bg-card"
              )}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground">{String(task.slot).padStart(2, "0")}</span>
                <span
                  className={cn(
                    "min-h-5 text-xs",
                    saveStates[task.slot] === "error" ? "text-destructive" : "text-muted-foreground"
                  )}
                  role={saveStates[task.slot] === "error" ? "alert" : "status"}
                >
                  {saveLabel(saveStates[task.slot] ?? "idle")}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  disabled={!task.title || task.inactive}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
                    task.completed
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary"
                  )}
                  aria-label={task.completed ? `将第 ${task.slot} 件事标为未完成` : `完成第 ${task.slot} 件事`}
                  aria-pressed={task.completed}
                >
                  {task.completed ? <Check className="size-5" /> : <Circle className="size-5" />}
                </button>
                <Input
                  ref={(node) => { inputs.current[index] = node }}
                  value={task.title}
                  maxLength={300}
                  placeholder={`可选事项 ${task.slot}`}
                  className={cn(
                    "h-11 min-w-0 px-3",
                    task.completed && "text-muted-foreground line-through"
                  )}
                  onChange={(event) => changeTitle(task, event.target.value)}
                  onBlur={() => flush(task.slot)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
                    event.preventDefault()
                    flush(task.slot)
                    inputs.current[index + 1]?.focus()
                  }}
                  aria-label={`第 ${task.slot} 件事`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={!task.title}
                  onClick={() => void removeTask(task)}
                  aria-label={`清空第 ${task.slot} 件事`}
                  title="清空"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <select
                value={task.sourceTodoId ?? ""}
                onChange={(event) => chooseTodo(task, event.target.value)}
                className="mt-3 h-11 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/40"
                aria-label={`为第 ${task.slot} 件事选择 Todo`}
              >
                <option value="">从进行中的 Todo 选择（可选）</option>
                {task.inactive && task.sourceTodoId && <option value={task.sourceTodoId}>原 Todo 已暂停 / 放弃，不计入今天</option>}
                {initialDashboard.todoOptions.map((todo) => (
                  <option
                    key={todo.id}
                    value={todo.id}
                    disabled={usedTodoIds.has(todo.id) && task.sourceTodoId !== todo.id}
                  >
                    {todo.category ? `${todo.category} · ` : ""}{todo.title}
                  </option>
                ))}
              </select>

              {task.inactive && <p className="mt-2 text-xs text-muted-foreground">原 Todo {task.sourceTodoStatus === "CANCELLED" ? "已放弃" : "已暂停"}，不计入今天或完成统计。可清空、替换，或在 Todo 中恢复。</p>}
              <p className="mt-2 min-h-5 text-xs text-destructive" role={errors[task.slot] ? "alert" : undefined}>
                {errors[task.slot] ?? ""}
              </p>
            </article>
          ))}
        </div>
      </section>

      <DailyReviewCard />

      <details className="mt-6 border-t border-border/60 py-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">查看完成情况与本月统计（可选）</summary>
      <section className="border-y border-border/60 py-7" aria-labelledby="daily-progress-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="daily-progress-heading" className="text-sm font-medium">今日完成度</h2>
          <span className="text-lg font-semibold tabular-nums">{day.progress}%</span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="今日完成度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={day.progress}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${day.progress}%` }}
          />
        </div>
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{feedback(day.progress, selectedCount)}</p>
      </section>

      <section className="grid gap-px bg-border/60 sm:grid-cols-3" aria-label="本月统计">
        <div className="flex min-h-28 items-center gap-4 bg-background py-6 pr-6 sm:px-6 sm:first:pl-0">
          <Flame className="size-5 text-primary" />
          <div>
            <p className="text-2xl font-semibold tabular-nums">{stats.streak} 天</p>
            <p className="mt-1 text-sm text-muted-foreground">连续完成</p>
          </div>
        </div>
        <div className="flex min-h-28 items-center gap-4 bg-background px-0 py-6 sm:px-6">
          <Clock3 className="size-5 text-primary" />
          <div>
            <p className="text-2xl font-semibold tabular-nums">{stats.recordedDays} 天</p>
            <p className="mt-1 text-sm text-muted-foreground">本月记录</p>
          </div>
        </div>
        <div className="flex min-h-28 items-center gap-4 bg-background py-6 pl-0 sm:px-6 sm:last:pr-0">
          <ListChecks className="size-5 text-primary" />
          <div>
            <p className="text-2xl font-semibold tabular-nums">{stats.averageProgress}%</p>
            <p className="mt-1 text-sm text-muted-foreground">本月平均完成度</p>
          </div>
        </div>
      </section>
      </details>
    </div>
  )
}
