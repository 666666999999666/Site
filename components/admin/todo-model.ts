export type EditableSubtask = {
  id?: string
  clientId: string
  title: string
  completed: boolean
}
export type StatusFilter = "TODO" | "DONE" | "ALL"

export type TodoEditFields = {
  title: string
  description: string
  categoryId: string
  projectId: string
  priority: string
  dueDate: string
  completionCriteria: string
  subtasks: EditableSubtask[]
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
  title, description, categoryId, projectId, priority, dueDate, completionCriteria, subtasks,
}: TodoEditFields) {
  return {
    title,
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
  status: "TODO" | "DONE"
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
      return `${todo.title}\n${todo.description || ""}\n${todo.completionCriteria || ""}\n${todo.project?.title || ""}\n${todo.subtasks.map((subtask) => subtask.title).join("\n")}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "TODO" ? -1 : 1
      if (a.priority !== b.priority) return (b.priority ?? -1) - (a.priority ?? -1)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}
