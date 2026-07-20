import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { TodoList } from "@/components/admin/TodoList"

export default async function TodosPage() {
  const [todos, categories] = await Promise.all([
    prisma.todo.findMany({ orderBy: { createdAt: "desc" }, include: { category: true } }),
    prisma.category.findMany({ where: { type: "TODO" }, orderBy: { sortOrder: "asc" } }),
  ])
  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">Todo</h1>
      <TodoList todos={todos} categories={categories} />
    </Container>
  )
}
