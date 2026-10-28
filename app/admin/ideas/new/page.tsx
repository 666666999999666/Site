import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { IdeaForm } from "@/components/admin/IdeaForm"
import { ensureAuthenticated } from "@/lib/api/auth"
import { safeIdeaReturnHref } from "@/lib/idea-list-navigation"

export const dynamic = "force-dynamic"

export default async function NewIdeaPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { userId } = await ensureAuthenticated()
  const { returnTo } = await searchParams
  const projects = await prisma.project.findMany({ orderBy: { sortOrder: "asc" } })
  return (
    <Container size="wide">
      <h1 className="mb-8 text-3xl font-semibold">新建素材</h1>
      <IdeaForm projects={projects} ownerId={userId} returnTo={safeIdeaReturnHref(returnTo)} />
    </Container>
  )
}
