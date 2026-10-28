import { isInactiveTodo } from "./todos-policy"

interface DailyProgressTask {
  title: string
  completed?: boolean
  completedAt?: Date | string | null
  inactive?: boolean
  sourceTodo?: { status: string } | null
}

/** Empty slots and paused/cancelled source tasks never become a quota or a completion. */
export function dailyProgress(tasks: readonly DailyProgressTask[]) {
  const selected = tasks.filter((task) => task.title.trim() && !task.inactive && !isInactiveTodo(task.sourceTodo?.status))
  const completedCount = selected.filter((task) => task.completed ?? Boolean(task.completedAt)).length
  return {
    selectedCount: selected.length,
    completedCount,
    progress: selected.length ? Math.round(completedCount / selected.length * 100) : 0,
  }
}
