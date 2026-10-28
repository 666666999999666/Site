import Link from "next/link"
import { prisma } from "@/lib/db"
import { PostForm } from "@/components/admin/PostForm"
import { Container } from "@/components/layout/Container"
import { notFound } from "next/navigation"
import type { Post, Category, Series } from "@/lib/generated/prisma/client"
import { ensureAuthenticated } from "@/lib/api/auth"
import { safePostReturnHref } from "@/lib/post-list-navigation"

type PostWithRelations = Post & { category: Category | null; series: Series | null }

export default async function EditPostPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string; returnTo?: string }>
}) {
  const { userId } = await ensureAuthenticated()
  const { id } = await params
  const { edit, returnTo } = await searchParams
  const [post, categories, series, sourceMaterials] = await Promise.all([
    prisma.post.findUnique({ where: { id }, include: { category: true, series: true } }) as Promise<PostWithRelations | null>,
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
    prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] }),
    prisma.ideaConversion.findMany({ where: { postId: id, ownerId: userId }, include: { idea: { select: { id: true, title: true } } } }),
  ])
  if (!post) notFound()
  return (
    <Container size="wide">
      {sourceMaterials.map(({ idea }) => <p key={idea.id} className="mb-4 text-sm text-muted-foreground">来源素材：<Link className="text-primary hover:underline" href={"/admin/ideas/" + idea.id}>{idea.title}</Link></p>)}
      <PostForm key={post.id} post={post} categories={categories} series={series} ownerId={userId} initiallyEditing={edit === "1"}
        returnTo={safePostReturnHref(returnTo)} />
    </Container>
  )
}
