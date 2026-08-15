import Link from "next/link"
import { Plus } from "lucide-react"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { Container } from "@/components/layout/Container"
import { IdeasList } from "@/components/admin/IdeasList"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function IdeasPage() {
  const { userId } = await ensureAuthenticated()
  const [ideas, projects] = await Promise.all([
    prisma.idea.findMany({
      where: { ownerId: userId },
      include: { projects: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({ orderBy: { sortOrder: "asc" } }),
  ])

  return (
    <Container size="wide">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Idea</h1>
          <p className="mt-2 text-sm text-muted-foreground">私人想法、随笔和下一步实验。</p>
        </div>
        <Link href="/admin/ideas/new" className={cn(buttonVariants(), "shrink-0 gap-1.5")}>
          <Plus className="size-4" /> 新建 Idea
        </Link>
      </div>
      <IdeasList initialIdeas={ideas} projects={projects} />
    </Container>
  )
}
