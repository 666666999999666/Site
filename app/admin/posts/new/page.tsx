import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"

export default async function NewPostPage() {
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
      <PostForm categories={categories} series={series} />
    </Container>
  )
}
