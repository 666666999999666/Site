import Link from "next/link"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ProjectsTable } from "@/components/admin/ProjectsTable"

export default async function ProjectsAdminPage() {
  const projects = await prisma.project.findMany({
    orderBy: { sortOrder: "asc" },
  })
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">项目管理</h1>
        <Link href="/admin/projects/new">
          <Button><Plus className="h-4 w-4 mr-1" /> 新建项目</Button>
        </Link>
      </div>
      <ProjectsTable initialProjects={projects} />
    </Container>
  )
}
