import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"

export default async function NewPostPage() {
  const categories = await prisma.category.findMany({
    where: { type: "BLOG" },
    orderBy: { sortOrder: "asc" },
  })
  return (
    <Container>
      <h1 className="text-3xl font-serif mb-8">写新文章</h1>
      <PostForm categories={categories} />
    </Container>
  )
}
