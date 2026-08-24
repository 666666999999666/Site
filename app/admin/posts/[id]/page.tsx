import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"
import { notFound } from "next/navigation"
import type { Post, Category, Series } from "@/lib/generated/prisma/client"

type PostWithRelations = Post & { category: Category | null; series: Series | null }

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [post, categories, series] = await Promise.all([
    prisma.post.findUnique({ where: { id }, include: { category: true, series: true } }) as Promise<PostWithRelations | null>,
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
    prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] }),
  ])
  if (!post) notFound()
  return (
    <Container size="wide">
      <h1 className="text-3xl font-semibold mb-8">编辑文章</h1>
      <PostForm post={post} categories={categories} series={series} />
    </Container>
  )
}
