import { IdeaForm } from "@/components/admin/IdeaForm"
import { PostForm } from "@/components/admin/PostForm"
import type { Category, Post, Project, Series } from "@/lib/generated/prisma/client"
import { ideaTestContent, postTestContent } from "@/tests/fixtures/document-content"

const date = new Date("2026-10-04T00:00:00Z")
const project = {
  id: "document-test-project", title: "演示项目", sortOrder: 0,
} as Project
const category = { id: "document-test-category", name: "演示分区", type: "BLOG", sortOrder: 0 } as Category

export default async function WorkflowPage({ searchParams }: {
  searchParams: Promise<{ kind?: string; fresh?: string; edit?: string; short?: string }>
}) {
  const params = await searchParams
  return (
    <main className="min-w-0">
      {params.kind === "post" ? (
        <PostForm ownerId="document-test-owner"
          post={params.fresh ? undefined : {
            id: "document-test-post", title: "长文阅读与编辑演示", content: postTestContent,
            excerpt: "", slug: "document-test-post", categoryId: category.id, category,
            seriesId: null, series: null, seriesOrder: null, tags: ["演示"],
            coverImage: null, draftMetadata: null, status: "PUBLISHED", readTime: 1,
            publishedAt: date, sourceInboxItemId: null, createdAt: date, updatedAt: date,
          } as Post & { category: Category | null; series: Series | null }}
          categories={[category]} series={[]} initiallyEditing={params.edit === "1"} />
      ) : (
        <IdeaForm ownerId="document-test-owner"
          idea={params.fresh ? undefined : {
            id: "document-test-idea", title: params.short ? "简短想法" : "Idea 阅读与编辑演示",
            content: params.short ? "保留一个简短想法。\n下一行仍是正文。" : ideaTestContent,
            tags: ["演示", "Markdown"], projects: [project],
            sourceInboxItem: { id: "document-test-source", rawInput: "idea：合成的来源原文\n第二行" },
          }} projects={[project]} initiallyEditing={params.edit === "1"} />
      )}
    </main>
  )
}
