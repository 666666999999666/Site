import Link from "next/link"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { buttonVariants } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ProjectsTable } from "@/components/admin/ProjectsTable"
import { cn } from "@/lib/utils"

export default async function ProjectsAdminPage() {
  const projects = await prisma.project.findMany({
    orderBy: { sortOrder: "asc" },
  })
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">项目管理</h1>
        <Link href="/admin/projects/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" /> 新建项目
        </Link>
      </div>
      <ProjectsTable initialProjects={projects} />
    </Container>
  )
}
