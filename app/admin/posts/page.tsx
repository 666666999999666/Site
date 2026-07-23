import Link from "next/link"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PostsList } from "@/components/admin/PostsList"

export default async function PostsPage() {
  const [posts, categories] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      include: { category: true },
    }),
    prisma.category.findMany({ where: { type: "BLOG" }, orderBy: { sortOrder: "asc" } }),
  ])
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">Blog</h1>
        <Link href="/admin/posts/new">
          <Button><Plus className="h-4 w-4 mr-1" /> 新文章</Button>
        </Link>
      </div>
      <PostsList initialPosts={posts} categories={categories} />
    </Container>
  )
}
