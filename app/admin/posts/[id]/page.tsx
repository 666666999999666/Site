import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"
import { notFound } from "next/navigation"
import type { Post, Category, Series } from "@/lib/generated/prisma/client"
import { ensureAuthenticated } from "@/lib/api/auth"

type PostWithRelations = Post & { category: Category | null; series: Series | null }

export default async function EditPostPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { userId } = await ensureAuthenticated()
  const { id } = await params
  const { edit } = await searchParams
  const [post, categories, series] = await Promise.all([
    prisma.post.findUnique({ where: { id }, include: { category: true, series: true } }) as Promise<PostWithRelations | null>,
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
    prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] }),
  ])
  if (!post) notFound()
  return (
    <Container size="wide">
      <PostForm key={post.id} post={post} categories={categories} series={series} ownerId={userId} initiallyEditing={edit === "1"} />
    </Container>
  )
}
