import { prisma } from "@/lib/db"
import { ProjectForm } from "@/components/admin/ProjectForm"
import { Container } from "@/components/layout/Container"
import { notFound } from "next/navigation"

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()
  return (
    <Container>
      <h1 className="text-3xl font-semibold mb-8">编辑项目</h1>
      <ProjectForm project={project} />
    </Container>
  )
}
