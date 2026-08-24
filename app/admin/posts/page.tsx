import Link from "next/link"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { buttonVariants } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PostsList } from "@/components/admin/PostsList"
import { cn } from "@/lib/utils"

export default async function PostsPage() {
  const [posts, categories, series] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      include: { category: true, series: true },
    }),
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
    prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] }),
  ])
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">Blog</h1>
        <Link href="/admin/posts/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" /> 新文章
        </Link>
      </div>
      <PostsList
        key={[
          ...posts.map((post) => `${post.id}:${post.updatedAt.toISOString()}:${post.categoryId}`),
          ...categories.map((category) => `${category.id}:${category.name}:${category.sortOrder}`),
          ...series.map((item) => `${item.id}:${item.title}:${item.slug}:${item.sortOrder}:${item.updatedAt.toISOString()}`),
        ].join("|")}
        initialPosts={posts}
        categories={categories}
        series={series}
      />
    </Container>
  )
}
