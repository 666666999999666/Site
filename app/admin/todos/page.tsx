import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { TodoList } from "@/components/admin/TodoList"
import { ensureAuthenticated } from "@/lib/api/auth"
import { todoIncludeForOwner } from "@/app/api/todos/_shared"

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const { userId } = await ensureAuthenticated()
  const [todos, categories, projects] = await Promise.all([
    prisma.todo.findMany({
      orderBy: [
        { priority: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      include: todoIncludeForOwner(userId),
    }),
    prisma.category.findMany({ where: { type: "TODO" }, orderBy: { sortOrder: "asc" } }),
    prisma.project.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }),
  ])
  return (
    <Container>
      <h1 className="text-3xl font-semibold mb-8">Todo</h1>
      <TodoList
        initialStatus={status === "ALL" ? "ALL" : "TODO"}
        key={[
          status === "ALL" ? "ALL" : "TODO",
          ...todos.map((todo) => [
            todo.id,
            todo.updatedAt.toISOString(),
            todo.categoryId,
            todo.projectId,
            todo.priority,
            ...todo.subtasks.map((subtask) => `${subtask.id}:${subtask.updatedAt.toISOString()}`),
          ].join(":")),
          ...categories.map((category) => `${category.id}:${category.name}:${category.sortOrder}`),
          ...projects.map((project) => `${project.id}:${project.title}:${project.sortOrder}`),
        ].join("|")}
        todos={todos}
        categories={categories}
        projects={projects}
      />
    </Container>
  )
}
