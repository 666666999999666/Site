import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"
import type { FeaturedPost } from "@/lib/featured-posts"

export async function FeaturedPosts({ posts }: { posts: FeaturedPost[] }) {
  if (!posts.length) return null
  const t = await getTranslations("home")

  return (
    <section className="py-12 sm:py-16" aria-labelledby="featured-posts-heading" data-testid="featured-reading">
      <Container>
        <h2 id="featured-posts-heading" className="mb-6 text-2xl font-bold">{t("startReading")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} data-post-id={post.id} className="group block min-w-0 rounded-lg border border-border/60 p-5 transition-colors hover:bg-muted/50">
              <article>
                <h3 className="break-words text-lg font-semibold group-hover:underline">{post.title}</h3>
                {post.excerpt && <p className="mt-3 line-clamp-3 break-words text-sm text-muted-foreground">{post.excerpt}</p>}
              </article>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  )
}
