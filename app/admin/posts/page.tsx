import Link from "next/link"
import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PostsTable } from "@/components/admin/PostsTable"

export default async function PostsPage() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  })
  return (
    <Container>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-serif">Blog</h1>
        <Link href="/admin/posts/new">
          <Button><Plus className="h-4 w-4 mr-1" /> 新文章</Button>
        </Link>
      </div>
      <PostsTable initialPosts={posts} />
    </Container>
  )
}
