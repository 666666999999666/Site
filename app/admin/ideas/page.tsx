import Link from "next/link"
import { Plus } from "lucide-react"
import { prisma } from "@/lib/db"
import { ensureAuthenticated } from "@/lib/api/auth"
import { Container } from "@/components/layout/Container"
import { IdeasList } from "@/components/admin/IdeasList"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { searchIdeas } from "@/lib/ideas"
import { ideaDocumentHref, ideaListHref, readIdeaListFilters } from "@/lib/idea-list-navigation"

export const dynamic = "force-dynamic"

export default async function IdeasPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId } = await ensureAuthenticated()
  const query = await searchParams
  const filters = readIdeaListFilters({ get: (key) => typeof query[key] === "string" ? query[key] as string : null })
  const listHref = ideaListHref(filters)
  const [ideas, projects, tagRows] = await Promise.all([
    searchIdeas(userId, filters),
    prisma.project.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.idea.findMany({
      where: { ownerId: userId },
      select: { tags: true },
    }),
  ])

  return (
    <Container size="wide">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Idea</h1>
          <p className="mt-2 text-sm text-muted-foreground">私人想法、随笔和下一步实验。</p>
        </div>
        <Link href={ideaDocumentHref("new", listHref)} className={cn(buttonVariants(), "shrink-0 gap-1.5")}>
          <Plus className="size-4" /> 新建 Idea
        </Link>
      </div>
      <IdeasList key={listHref} initialIdeas={ideas} projects={projects} initialFilters={filters}
        knownTags={tagRows.flatMap((row) => row.tags)} ownerId={userId} />
    </Container>
  )
}
