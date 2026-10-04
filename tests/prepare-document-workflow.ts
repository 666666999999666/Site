import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import { requireDocumentTestDatabaseUrl } from "./document-test-database"
import { ideaTestContent, postTestContent } from "./fixtures/document-content"

const connection = requireDocumentTestDatabaseUrl(process.env.DOCUMENT_TEST_DATABASE_URL)
process.env.DATABASE_URL = connection
execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: connection }, stdio: "inherit",
})

async function prepare() {
  const { prisma } = await import("../lib/db")
  const { hashPassword } = await import("../lib/auth/password")
  try {
    // 只清理此前失败运行在这个隔离库中留下的新建测试记录。
    await prisma.idea.deleteMany({ where: {
      ownerId: "document-test-owner", title: "测试创建的 Idea",
      id: { notIn: Array.from({ length: 12 }, (_, index) => "document-test-idea-" + index) },
    } })
    await prisma.post.deleteMany({ where: {
      title: "测试创建的文章",
      id: { notIn: ["document-test-post-draft", "document-test-post-published"] },
    } })
    const passwordHash = await hashPassword("Document-Test-Only-2026!")
    for (const [index, id] of ["document-test-owner", "document-test-other"].entries()) {
      await prisma.user.upsert({
        where: { id }, update: { passwordHash },
        create: { id, username: id, name: "Document Test", email: id + "@example.test", passwordHash,
          createdAt: new Date("2020-01-0" + (index + 1) + "T00:00:00Z") },
      })
      await prisma.account.upsert({
        where: { providerId_accountId: { providerId: "credential", accountId: id } },
        update: { password: passwordHash },
        create: { userId: id, providerId: "credential", accountId: id, password: passwordHash },
      })
    }
    const project = await prisma.project.upsert({
      where: { id: "document-test-project" }, update: {},
      create: { id: "document-test-project", title: "演示项目", tags: ["演示"] },
    })
    const category = await prisma.category.upsert({
      where: { id: "document-test-category" }, update: {},
      create: { id: "document-test-category", name: "演示分区", type: "BLOG" },
    })
    const series = await prisma.series.upsert({
      where: { id: "document-test-series" }, update: {},
      create: { id: "document-test-series", title: "演示系列", slug: "document-test-series", description: "合成的测试系列" },
    })
    const rawInput = "idea：合成的来源原文\n第二行"
    await prisma.inboxItem.upsert({
      where: { id: "document-test-source" }, update: {},
      create: { id: "document-test-source", ownerId: "document-test-owner", kind: "IDEA", status: "APPLIED",
        rawInput, rawSha256: createHash("sha256").update(rawInput).digest("hex"), parsedBody: "合成的来源原文\n第二行",
        parserVersion: 1, requestKey: "document-test-source-request" },
    })
    for (let index = 0; index < 12; index++) {
      const id = "document-test-idea-" + index
      const data = {
        title: index === 0 ? "长笔记演示" : "短笔记演示 " + index,
        content: index === 0 ? ideaTestContent : "这是人工构造的简短想法。\n保留换行。",
        tags: ["演示"], projects: { set: [{ id: project.id }] },
      }
      await prisma.idea.upsert({
        where: { id }, update: data,
        create: { ...data, id, ownerId: "document-test-owner", projects: { connect: { id: project.id } },
          sourceInboxItemId: index === 0 ? "document-test-source" : null },
      })
    }
    await prisma.idea.upsert({
      where: { id: "document-test-other-idea" }, update: {},
      create: { id: "document-test-other-idea", ownerId: "document-test-other", title: "另一所有者笔记",
        content: "other-owner-private-sentinel" },
    })
    for (const status of ["DRAFT", "PUBLISHED"] as const) {
      const id = "document-test-post-" + status.toLowerCase()
      const data = { title: status === "DRAFT" ? "草稿阅读演示" : "长文阅读演示",
        content: postTestContent.replace("/test-document-image.svg", "/og-default.png"),
        categoryId: category.id, seriesId: series.id, seriesOrder: null, tags: ["演示"], status,
        publishedAt: status === "PUBLISHED" ? new Date("2026-10-04T00:00:37.123Z") : null }
      await prisma.post.upsert({ where: { id }, update: data, create: { ...data, id, slug: id } })
    }
    const legacy = {
      title: "旧格式兼容演示", status: "DRAFT" as const, tags: ["演示"],
      content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "旧格式原文" }] }] }),
    }
    await prisma.post.upsert({
      where: { id: "document-test-post-legacy" }, update: legacy,
      create: { ...legacy, id: "document-test-post-legacy", slug: "document-test-post-legacy" },
    })
    await prisma.todo.upsert({
      where: { id: "document-test-todo-sentinel" }, update: {},
      create: { id: "document-test-todo-sentinel", title: "Todo 不应受展示改造影响", status: "TODO" },
    })
    console.log("Prepared disposable document test database: 12 owner Ideas, 1 foreign Idea, 3 posts including legacy format, 1 Todo.")
  } finally {
    await prisma.$disconnect()
  }
}

prepare().catch((error) => { console.error(error); process.exitCode = 1 })
