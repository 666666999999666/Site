export const TODO_STATUSES = ["TODO", "DONE", "PAUSED", "CANCELLED"] as const
export type TodoStatusValue = typeof TODO_STATUSES[number]

export const TODO_STATUS_LABELS: Record<TodoStatusValue, string> = {
  TODO: "进行中",
  DONE: "已完成",
  PAUSED: "已暂停",
  CANCELLED: "已放弃",
}

export function isInactiveTodo(status: string | null | undefined): boolean {
  return status === "PAUSED" || status === "CANCELLED"
}
