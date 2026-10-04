import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { Container } from "@/components/layout/Container"
import { IdeaForm } from "@/components/admin/IdeaForm"

export const dynamic = "force-dynamic"

export default async function EditIdeaPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { userId } = await ensureAuthenticated()
  const { id } = await params
  const { edit } = await searchParams
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
      <IdeaForm key={idea.id} idea={idea} projects={projects} ownerId={userId} initiallyEditing={edit === "1"} />
    </Container>
  )
}
