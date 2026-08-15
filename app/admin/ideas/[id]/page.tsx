import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { Container } from "@/components/layout/Container"
import { IdeaForm } from "@/components/admin/IdeaForm"

export const dynamic = "force-dynamic"

export default async function EditIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await ensureAuthenticated()
  const { id } = await params
  const [idea, projects] = await Promise.all([
    prisma.idea.findFirst({
      where: { id, ownerId: userId },
      include: {
        projects: { orderBy: { sortOrder: "asc" } },
        sourceInboxItem: { select: { id: true, rawInput: true } },
      },
    }),
    prisma.project.findMany({ orderBy: { sortOrder: "asc" } }),
  ])
  if (!idea) notFound()

  return (
    <Container size="wide">
      <h1 className="mb-8 text-3xl font-semibold">编辑 Idea</h1>
      <IdeaForm idea={idea} projects={projects} />
    </Container>
  )
}
