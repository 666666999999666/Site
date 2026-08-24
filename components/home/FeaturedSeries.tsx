import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"

export interface FeaturedSeriesItem {
  id: string
  title: string
  slug: string
  description: string
  postCount: number
  firstPost: { title: string; slug: string } | null
}

export async function FeaturedSeries({ items }: { items: FeaturedSeriesItem[] }) {
  if (items.length === 0) return null
  const t = await getTranslations("home")

  return (
    <section className="py-12 sm:py-16" aria-labelledby="featured-series-heading">
      <Container>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 id="featured-series-heading" className="text-2xl font-bold">{t("featuredSeries")}</h2>
          <Link href="/blog/series" className="text-sm text-muted-foreground hover:text-foreground">
            {t("viewSeries")} →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-border/60 p-5">
              <h3 className="font-semibold">
                <Link href={`/blog/series/${item.slug}`} className="hover:underline">{item.title}</Link>
              </h3>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">{t("seriesPosts", { count: item.postCount })}</p>
              {item.firstPost && (
                <Link href={`/blog/${item.firstPost.slug}`} className="mt-3 block truncate text-sm text-primary hover:underline">
                  {item.firstPost.title} →
                </Link>
              )}
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
