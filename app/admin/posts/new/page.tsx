import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"
import { ensureAuthenticated } from "@/lib/api/auth"
import { safePostReturnHref } from "@/lib/post-list-navigation"

export default async function NewPostPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { userId } = await ensureAuthenticated()
  const { returnTo } = await searchParams
  const [categories, series] = await Promise.all([
    prisma.category.findMany({
      where: { type: "BLOG" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] }),
  ])
  return (
    <Container size="wide">
      <h1 className="text-3xl font-semibold mb-8">写新文章</h1>
      <PostForm categories={categories} series={series} ownerId={userId} returnTo={safePostReturnHref(returnTo)} />
    </Container>
  )
}
