import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/db"
import { Link } from "@/i18n/navigation"
import { PostContent } from "@/components/blog/PostContent"
import { TableOfContents } from "@/components/blog/TableOfContents"

export const dynamic = "force-dynamic"

interface Heading {
  id: string
  text: string
  level: number
}

function extractHeadings(content: string): Heading[] {
  try {
    const json = JSON.parse(content)
    const headings: Heading[] = []

    function walk(node: Record<string, unknown>) {
      if (node.type === "heading" && node.attrs && typeof node.attrs === "object") {
        const level = (node.attrs as { level: number }).level
        // Extract text from the heading's content
        let text = ""
        if (Array.isArray(node.content)) {
          for (const child of node.content as Record<string, unknown>[]) {
            if (child.type === "text" && typeof child.text === "string") {
              text += child.text
            }
          }
        }
        if (text) {
          const id = text
            .toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
          headings.push({ id, text, level })
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content as Record<string, unknown>[]) {
          walk(child)
        }
      }
    }

    walk(json)
    return headings
  } catch {
    return []
  }
}

async function getPost(slug: string) {
  const post = await prisma.post.findUnique({
    where: { slug },
    include: { category: true },
  })
  return post
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const post = await getPost(slug)
  if (!post || post.status !== "PUBLISHED") notFound()

  const t = await getTranslations("blog")
  const headings = extractHeadings(post.content)

  const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  )

  return (
    <section className="py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex gap-12">
          {/* Main content */}
          <article className="min-w-0 max-w-3xl flex-1">
            <header className="mb-10">
              <Link
                href="/blog"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                ← {t("backLink")}
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
                {post.title}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {post.category && <span>{post.category.name}</span>}
                {post.category && <span>·</span>}
                <time>{date}</time>
                <span>·</span>
                <span>{t("minuteRead", { count: post.readTime })}</span>
              </div>
            </header>

            <PostContent content={post.content} />

            {post.tags.length > 0 && (
              <div className="mt-16 border-t border-border/50 pt-6">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs rounded-full border border-border/50 text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Table of Contents - sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <TableOfContents headings={headings} />
          </aside>
        </div>
      </div>
    </section>
  )
}
