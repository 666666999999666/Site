import { notFound } from "next/navigation"
import { Container } from "@/components/layout/Container"
import { PostContent } from "@/components/blog/PostContent"
import { getPostBySlug } from "@/lib/posts"
import { prisma } from "@/lib/db"

export const dynamic = "force-static"
export const revalidate = 3600

async function getPost(slug: string) {
  const post = await prisma.post.findUnique({
    where: { slug },
    include: { category: true },
  })
  return post
}

export async function generateStaticParams() {
  const posts = await prisma.post.findMany({ where: { status: "PUBLISHED" } })
  return posts.map((p) => ({ slug: p.slug }))
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || post.status !== "PUBLISHED") notFound()

  const date = new Date(post.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })

  return (
    <Container size="narrow" className="py-16">
      <article>
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-serif text-ink mb-3">{post.title}</h1>
          <div className="text-sm text-ink-muted">
            <time>{date}</time> · {post.readTime} min read
            {post.category && <span> · {post.category.name}</span>}
          </div>
        </header>
        <PostContent content={post.content} />
        {post.tags.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <span key={t} className="px-3 py-1 text-xs rounded-full bg-paper text-ink-muted border border-line">#{t}</span>
            ))}
          </div>
        )}
      </article>
    </Container>
  )
}
