import { NextIntlClientProvider } from "next-intl"
import { Header } from "@/components/layout/Header"
import { MobileTableOfContents } from "@/components/blog/MobileTableOfContents"
import { PostContent } from "@/components/blog/PostContent"
import { IdeaContent } from "@/components/admin/IdeaContent"
import { ArticlePublicationPreview } from "@/components/admin/ArticlePublicationPreview"
import { extractHeadings } from "@/lib/content"
import { readerTestContent } from "@/tests/fixtures/reader-content"
import zh from "@/messages/zh.json"

export default async function ReaderLayoutPage({ searchParams }: {
  searchParams: Promise<{ kind?: string }>
}) {
  const { kind } = await searchParams
  return (
    <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={zh} formats={{}} now={new Date("2026-10-05T00:00:00Z")}>
      <Header siteName="阅读测试" githubUrl="https://example.test/project" />
      <main className="reader-layout-main">
        <section className="article-page py-12">
          <MobileTableOfContents headings={extractHeadings(readerTestContent)} />
          <article className="mx-auto min-w-0 max-w-3xl px-6">
            <h1 className="mb-8 text-3xl font-bold">合成阅读样例</h1>
            {kind === "idea" ? <IdeaContent content={readerTestContent} />
              : kind === "preview" ? <div className="admin-reading"><ArticlePublicationPreview content={readerTestContent} /></div>
                : <PostContent content={readerTestContent} />}
          </article>
        </section>
      </main>
    </NextIntlClientProvider>
  )
}
