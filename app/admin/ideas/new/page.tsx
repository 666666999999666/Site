import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { IdeaForm } from "@/components/admin/IdeaForm"

export const dynamic = "force-dynamic"

export default async function NewIdeaPage() {
  const projects = await prisma.project.findMany({ orderBy: { sortOrder: "asc" } })
  return (
    <Container size="wide">
      <h1 className="mb-8 text-3xl font-semibold">新建 Idea</h1>
      <IdeaForm projects={projects} />
    </Container>
  )
}
