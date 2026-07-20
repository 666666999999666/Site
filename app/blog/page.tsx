import Link from "next/link"
import { Container } from "@/components/layout/Container"
import { getAllPosts } from "@/lib/posts"

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
}

export const dynamic = "force-static"
export const revalidate = 3600

export default async function BlogPage() {
  const posts = await getAllPosts()
  return (
    <Container size="narrow" className="py-16">
      <h1 className="text-3xl font-serif text-ink mb-10">文章</h1>
      {posts.length === 0 ? (
        <p className="text-ink-muted">还没有文章。</p>
      ) : (
        <ul className="space-y-10">
          {posts.map((p) => (
            <li key={p.id} className="border-b border-line pb-8">
              <Link href={`/blog/${p.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <h2 className="text-2xl text-ink group-hover:text-accent transition-colors">{p.title}</h2>
                  <time className="text-sm text-ink-muted whitespace-nowrap">{formatDate(p.createdAt)}</time>
                </div>
                {p.excerpt && <p className="text-ink-muted mb-2">{p.excerpt}</p>}
                <div className="text-xs text-ink-muted">{p.readTime} min read</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
