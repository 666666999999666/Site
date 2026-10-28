import { type TodoStatusValue } from "@/lib/todos-policy"

export type EditableSubtask = {
  id?: string
  clientId: string
  title: string
  completed: boolean
}
export type StatusFilter = TodoStatusValue | "ALL"

export type TodoEditFields = {
  title: string
  description: string
  categoryId: string
  projectId: string
  priority: string
  dueDate: string
  completionCriteria: string
  subtasks: EditableSubtask[]
  status?: TodoStatusValue
  statusReason?: string
}

export function dueDateInput(value: Date | string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function dueDateIso(value: string): string | null {
  if (!value) return null
  return new Date(`${value}T12:00:00`).toISOString()
}

export function editableTodoSubtasks(subtasks: { id: string; title: string; completed: boolean }[]): EditableSubtask[] {
  return subtasks.map((subtask) => ({
    id: subtask.id,
    clientId: subtask.id,
    title: subtask.title,
    completed: subtask.completed,
  }))
}

// This is only payload normalization; validation and save/error state stay in the component.
export function todoMutationInput({
  title, description, categoryId, projectId, priority, dueDate, completionCriteria, subtasks, status, statusReason,
}: TodoEditFields) {
  return {
    title,
    ...(status ? { status } : {}),
    ...(statusReason !== undefined ? { statusReason: statusReason || null } : {}),
    description: description || null,
    categoryId: categoryId || null,
    projectId: projectId || null,
    priority: priority === "" ? null : Number(priority),
    dueDate: dueDateIso(dueDate),
    completionCriteria: completionCriteria || null,
    subtasks: subtasks
      .filter((subtask) => subtask.title.trim())
      .map((subtask, index) => ({
        ...(subtask.id ? { id: subtask.id } : {}),
        title: subtask.title,
        completed: subtask.completed,
        sortOrder: index,
      })),
  }
}

export type TodoListEntry = {
  title: string
  description: string | null
  completionCriteria: string | null
  categoryId: string | null
  project: { title: string } | null
  subtasks: { title: string }[]
  status: TodoStatusValue
  statusReason?: string | null
  priority: number | null
  createdAt: Date | string
}

/** Return a new filtered/sorted view; never reorder the component's source array. */
export function filterTodos<T extends TodoListEntry>(
  todos: T[], activeGroupId: string | null, statusFilter: StatusFilter, query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return todos
    .filter((todo) => !activeGroupId || todo.categoryId === activeGroupId)
    .filter((todo) => statusFilter === "ALL" || todo.status === statusFilter)
    .filter((todo) => {
      if (!normalizedQuery) return true
      return `${todo.title}\n${todo.description || ""}\n${todo.completionCriteria || ""}\n${todo.statusReason || ""}\n${todo.project?.title || ""}\n${todo.subtasks.map((subtask) => subtask.title).join("\n")}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    })
    .sort((a, b) => {
      if (a.status !== b.status) {
        const order = { TODO: 0, PAUSED: 1, CANCELLED: 2, DONE: 3 }
        return order[a.status] - order[b.status]
      }
      if (a.priority !== b.priority) return (b.priority ?? -1) - (a.priority ?? -1)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}
