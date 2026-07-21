import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"
import { notFound } from "next/navigation"
import type { Post, Category } from "@/lib/generated/prisma/client"

type PostWithCategory = Post & { category: Category | null }

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [post, categories] = await Promise.all([
    prisma.post.findUnique({ where: { id }, include: { category: true } }) as Promise<PostWithCategory | null>,
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
  ])
  if (!post) notFound()
  return (
    <Container>
      <h1 className="text-3xl font-semibold mb-8">编辑文章</h1>
      <PostForm post={post} categories={categories} />
    </Container>
  )
}
