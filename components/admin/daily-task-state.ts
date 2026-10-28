import { dailyProgress } from "@/lib/daily-policy"

import type { DailyDayView, DailyTaskView, DailyTodoOption } from "@/lib/daily"

export function withTask(day: DailyDayView, nextTask: DailyTaskView): DailyDayView {
  const tasks = day.tasks.map((task) => task.slot === nextTask.slot ? nextTask : task)
  const { completedCount, progress } = dailyProgress(tasks)
  return {
    ...day,
    tasks,
    completedCount,
    progress,
  }
}

export function changeTaskTitle(task: DailyTaskView, title: string, source?: Pick<DailyTodoOption, "title">): DailyTaskView {
  return {
    ...task,
    title,
    completed: title ? task.completed : false,
    completedAt: title ? task.completedAt : null,
    sourceTodoId: source?.title === title ? task.sourceTodoId : null,
    ...(task.inactive ? { inactive: source?.title === title, sourceTodoStatus: source?.title === title ? task.sourceTodoStatus : null, completed: false, completedAt: null } : {}),
  }
}

export function selectTaskTodo(task: DailyTaskView, todo?: Pick<DailyTodoOption, "id" | "title">): DailyTaskView {
  return {
    ...task,
    title: todo?.title ?? task.title,
    sourceTodoId: todo?.id ?? null,
    ...(task.inactive ? { inactive: false, sourceTodoStatus: null } : {}),
    completed: false,
    completedAt: null,
  }
}
