import type { DailyDayView, DailyTaskView, DailyTodoOption } from "@/lib/daily"

export function withTask(day: DailyDayView, nextTask: DailyTaskView): DailyDayView {
  const tasks = day.tasks.map((task) => task.slot === nextTask.slot ? nextTask : task)
  const completedCount = tasks.filter((task) => task.completed).length
  return {
    ...day,
    tasks,
    completedCount,
    progress: Math.round((completedCount / 3) * 100),
  }
}

export function changeTaskTitle(task: DailyTaskView, title: string, source?: Pick<DailyTodoOption, "title">): DailyTaskView {
  return {
    ...task,
    title,
    completed: title ? task.completed : false,
    completedAt: title ? task.completedAt : null,
    sourceTodoId: source?.title === title ? task.sourceTodoId : null,
  }
}

export function selectTaskTodo(task: DailyTaskView, todo?: Pick<DailyTodoOption, "id" | "title">): DailyTaskView {
  return {
    ...task,
    title: todo?.title ?? task.title,
    sourceTodoId: todo?.id ?? null,
    completed: false,
    completedAt: null,
  }
}

