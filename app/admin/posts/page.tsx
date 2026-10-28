import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { PostsList } from "@/components/admin/PostsList"
import { PostCreateLink } from "@/components/admin/PostCreateLink"
import { ensureAuthenticated } from "@/lib/api/auth"
import { searchPosts } from "@/lib/posts"
import { postListHref, readPostListFilters } from "@/lib/post-list-navigation"

export default async function PostsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId } = await ensureAuthenticated()
  const query = await searchParams
  const filters = readPostListFilters({ get: (key) => typeof query[key] === "string" ? query[key] as string : null })
  const listHref = postListHref(filters)
  const [posts, categories, series] = await Promise.all([
    searchPosts({ keyword: filters.q || undefined, status: "ALL" }),
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
    prisma.series.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }, { id: "asc" }] }),
  ])
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">文章</h1>
        <PostCreateLink />
      </div>
      <PostsList
        key={[
          listHref,
          ...posts.map((post) => `${post.id}:${post.updatedAt.toISOString()}:${post.categoryId}`),
          ...categories.map((category) => `${category.id}:${category.name}:${category.sortOrder}`),
          ...series.map((item) => `${item.id}:${item.title}:${item.slug}:${item.sortOrder}:${item.updatedAt.toISOString()}`),
        ].join("|")}
        initialPosts={posts}
        categories={categories}
        series={series}
        initialFilters={filters}
        ownerId={userId}
      />
    </Container>
  )
}
