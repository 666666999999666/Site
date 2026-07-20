import Link from "next/link"
import { Container } from "@/components/layout/Container"
import type { Post, Category } from "@/lib/generated/prisma/client"

type PostWithCategory = Post & { category: Category | null }

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
}

export function RecentPosts({ posts }: { posts: PostWithCategory[] }) {
  if (posts.length === 0) {
    return (
      <section className="py-16">
        <Container size="narrow">
          <p className="text-center text-ink-muted">还没有文章，开始写下第一篇吧。</p>
        </Container>
      </section>
    )
  }
  return (
    <section className="py-16">
      <Container size="narrow">
        <h2 className="text-2xl font-serif text-ink mb-8">最近文章</h2>
        <ul className="space-y-8">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/${p.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <h3 className="text-xl text-ink group-hover:text-accent transition-colors">{p.title}</h3>
                  <time className="text-sm text-ink-muted whitespace-nowrap">{formatDate(p.createdAt)}</time>
                </div>
                {p.excerpt && <p className="text-ink-muted">{p.excerpt}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-ink-muted">
                  <span>{p.readTime} min read</span>
                  {p.category && <span>· {p.category.name}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 text-center">
          <Link href="/blog" className="text-accent hover:text-accent-hover transition-colors">
            查看全部文章 -&gt;
          </Link>
        </div>
      </Container>
    </section>
  )
}
