import assert from "node:assert/strict"
import { spawn, execFileSync, type ChildProcess } from "node:child_process"
import { mkdirSync, openSync, closeSync, writeFileSync } from "node:fs"
import { request, type APIRequestContext, type APIResponse } from "@playwright/test"
import { requireInboxTestDatabaseUrl } from "./inbox-test-database"

const databaseUrl = requireInboxTestDatabaseUrl(process.env.INBOX_TEST_DATABASE_URL)
const testDestination = new URL(databaseUrl)
assert.equal(testDestination.pathname, "/site_test_inbox", "Run only with scripts/with-isolated-postgres.sh")
assert.equal(testDestination.username, "site_test_admin")
assert.equal(testDestination.search, "")
process.env.DATABASE_URL = databaseUrl
const baseURL = "http://127.0.0.1:3258"
const password = "Material-HTTP-Synthetic-2026-Only!"
const secret = "material-http-test-only-session-secret-2026"
const marker = "HTTP_PRIVATE_MATERIAL_20261028"
const checks: string[] = []
let server: ChildProcess | undefined
let api: APIRequestContext | undefined
let anonymous: APIRequestContext | undefined
let disconnectDatabase = async () => {}

async function expectJson(response: APIResponse, status = 200, isPrivate = true) {
  assert.equal(response.status(), status, `${response.url()} ${await response.text()}`)
  if (isPrivate) assert.match(response.headers()["cache-control"] ?? "", /private.*no-store/)
  return response.json()
}

async function main() {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "inherit" })
  const { prisma } = await import("../lib/db")
  disconnectDatabase = () => prisma.$disconnect()
  const { hashPassword } = await import("../lib/auth/password")
  assert.equal(await prisma.user.count(), 0, "Refusing to reuse a database containing existing users")
  const hash = await hashPassword(password)
  const owner = await prisma.user.create({ data: {
    username: "material-http-owner", name: "Synthetic HTTP owner", email: "material-http-owner@example.test", passwordHash: hash,
    createdAt: new Date("1900-01-01T00:00:00Z"),
  } })
  await prisma.account.create({ data: { userId: owner.id, providerId: "credential", accountId: owner.id, password: hash } })
  const foreign = await prisma.user.create({ data: {
    username: "material-http-other", name: "Other synthetic owner", email: "material-http-other@example.test", passwordHash: hash,
  } })
  const foreignIdea = await prisma.idea.create({ data: { ownerId: foreign.id, title: marker + " FOREIGN", content: "Owner isolation" } })

  mkdirSync("test-results", { recursive: true })
  const log = openSync("test-results/material-http-server.log", "w")
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-H", "127.0.0.1", "-p", "3258"], {
    env: { ...process.env, NODE_ENV: "development", DATABASE_URL: databaseUrl, NEXT_PUBLIC_SITE_URL: baseURL,
      SESSION_SECRET: secret, APP_RELEASE_SHA: "9d69fdd6d10c945757b85510e606c581be39d612", NEXT_DIST_DIR: ".next-material-http", NEXT_TELEMETRY_DISABLED: "1", QUESTION_TEST_DISABLE_WEBPACK_CACHE: "1" },
    stdio: ["ignore", log, log],
  })
  closeSync(log)
  server.on("exit", (code, signal) => console.log("Material HTTP server exited", JSON.stringify({ code, signal })))
  server.on("error", error => console.error("Material HTTP server launch error", error))
  anonymous = await request.newContext({ baseURL })
  api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  const deadline = Date.now() + 180_000
  while (true) {
    if (server.exitCode !== null) throw new Error("Local test server exited before readiness; see test-results/material-http-server.log")
    try { if ((await anonymous.get("/api/health", { timeout: 10_000 })).ok()) break } catch { /* Startup is bounded by the deadline. */ }
    if (Date.now() > deadline) throw new Error("Local test server readiness timed out")
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  for (const path of ["/api/inbox/items", "/api/ideas", "/api/todos", "/api/posts", "/api/questions"]) {
    const response = await anonymous.get(path)
    assert.equal(response.status(), 401, path)
    assert.match(response.headers()["cache-control"] ?? "", /private.*no-store/, path)
  }
  assert.equal((await anonymous.post("/api/inbox/items", { headers: { Origin: baseURL }, data: { rawInput: "private", requestKey: "anonymous" } })).status(), 401)
  assert.equal((await anonymous.post("/api/mcp", { data: {} })).status(), 401)
  checks.push("Anonymous private API and MCP requests denied; private API no-store")

  await expectJson(await api.post("/api/auth/login", { data: { password } }), 200, false)
  assert.equal((await api.post("/api/inbox/items", { headers: { Origin: "https://attacker.invalid" }, data: { rawInput: "bad origin", requestKey: "bad-origin" } })).status(), 403)
  const rawInput = `${marker}\n1. 一本书\n2. 一段情绪\n3. https://example.test/source\n4. 一个工具念头\n5. Agent 讨论\n6. Python 问题\n7. <img src=x onerror=alert(1)>  \n`
  const capture = { rawInput, requestKey: "http-material-mixed-seven", source: "http-acceptance" }
  const item = await expectJson(await api.post("/api/inbox/items", { data: capture }), 201)
  assert.equal(item.rawInput, rawInput)
  assert.equal(item.execution.targetType, "IDEA")
  assert.equal(item.status, "APPLIED")
  const duplicate = await expectJson(await api.post("/api/inbox/items", { data: capture }), 201)
  assert.equal(duplicate.id, item.id)
  assert.equal(duplicate.execution.targetId, item.execution.targetId)
  assert.equal(await prisma.todo.count(), 0)
  assert.equal(await prisma.post.count(), 0)
  assert.equal(await prisma.idea.count({ where: { ownerId: owner.id } }), 1)
  const firstId = item.execution.targetId as string
  const first = await expectJson(await api.get(`/api/ideas/${firstId}`))
  assert.equal(first.rawInput, rawInput)
  assert.equal(first.source, "http-acceptance")
  assert.ok(first.capturedAt)
  assert.equal(first.discussionStatus, "STORED")
  assert.equal((await api.get(`/api/ideas/${foreignIdea.id}`)).status(), 404)
  assert.equal((await anonymous.get(`/api/ideas/${firstId}`)).status(), 401)
  const forcedRaw = `todo：${marker} 第二条只作为素材`
  const secondItem = await expectJson(await api.post("/api/inbox/items", { data: { rawInput: forcedRaw, mode: "material", requestKey: "http-material-force-prefix" } }), 201)
  assert.equal(secondItem.execution.targetType, "IDEA")
  const secondId = secondItem.execution.targetId as string
  assert.equal(await prisma.todo.count(), 0)
  checks.push("Seven mixed fragments create one private material, exact raw/source/time retained; repeated capture deduplicates; forced material ignores Todo prefix")

  for (const id of [firstId, secondId]) await expectJson(await api.patch(`/api/ideas/${id}`, { data: { discussionStatus: "WANT_DISCUSS" } }))
  await expectJson(await api.patch(`/api/ideas/${firstId}`, { data: { title: marker + " 解读标题", content: "人工整理内容", discussionSummary: "先聊 Agent 原理，不转成七项任务" } }))
  const want = await expectJson(await api.get("/api/ideas?discussionStatus=WANT_DISCUSS"))
  assert.equal(want.length, 2)
  await expectJson(await api.patch(`/api/ideas/${secondId}`, { data: { discussionStatus: "DISCUSSED", discussionSummary: "已经讨论，暂时不做" } }))
  await expectJson(await api.patch(`/api/ideas/${secondId}`, { data: { discussionStatus: "ARCHIVED" } }))
  const reread = await expectJson(await api.get(`/api/ideas/${firstId}`))
  assert.equal(reread.rawInput, rawInput)
  assert.equal((await expectJson(await api.get("/api/ideas?discussionStatus=WANT_DISCUSS"))).length, 1)
  assert.equal((await expectJson(await api.get("/api/ideas?q=" + encodeURIComponent("一本书")))).length, 1)
  assert.equal((await expectJson(await api.get("/api/ideas?q=" + encodeURIComponent("先聊 Agent")))).length, 1)
  checks.push("Two selected discussions, summary, resume/archive and original-text search survive edits")

  const todoInput = { targetType: "TODO", requestKey: "http-convert-one-todo", title: marker + " deliberate task", description: "Only one deliberate action" }
  const convertedTodo = await expectJson(await api.post(`/api/ideas/${firstId}/conversions`, { data: todoInput }), 201)
  assert.deepEqual(await expectJson(await api.post(`/api/ideas/${firstId}/conversions`, { data: todoInput }), 201), convertedTodo)
  assert.equal((await api.post(`/api/ideas/${firstId}/conversions`, { data: { ...todoInput, title: "Different content" } })).status(), 409)
  assert.equal(await prisma.todo.count(), 1)
  const draftInput = { targetType: "BLOG", requestKey: "http-convert-one-draft", title: marker + " private draft", content: marker + " draft body" }
  const convertedPost = await expectJson(await api.post(`/api/ideas/${secondId}/conversions`, { data: draftInput }), 201)
  assert.deepEqual(await expectJson(await api.post(`/api/ideas/${secondId}/conversions`, { data: draftInput }), 201), convertedPost)
  assert.equal(await prisma.post.count(), 1)
  assert.equal((await expectJson(await api.get(`/api/posts/${convertedPost.targetId}`))).status, "DRAFT")
  assert.ok((await expectJson(await api.get(`/api/ideas/${firstId}`))).conversions.some((conversion: { todoId: string }) => conversion.todoId === convertedTodo.targetId))
  checks.push("Deliberate Todo/draft conversion backlinks and identical retries deduplicate; changed retry rejected")

  const dashboard = await expectJson(await api.get("/api/daily"), 200, false)
  await expectJson(await api.put("/api/daily/tasks/1", { data: { date: dashboard.date, title: todoInput.title, sourceTodoId: convertedTodo.targetId, completed: true } }), 200, false)
  for (const status of ["PAUSED", "CANCELLED"]) {
    await expectJson(await api.patch(`/api/todos/${convertedTodo.targetId}`, { data: { status, statusReason: "现在不做" } }))
    assert.equal((await expectJson(await api.get("/api/todos?status=TODO"))).length, 0)
    assert.equal((await expectJson(await api.get("/api/todos?status=DONE"))).length, 0)
    const inactive = await expectJson(await api.get("/api/daily"), 200, false)
    const { getDailyDashboard } = await import("../lib/daily")
    assert.ok(!(await getDailyDashboard(owner.id)).todoOptions.some(todo => todo.id === convertedTodo.targetId))
    assert.equal(inactive.tasks[0].inactive, true)
    assert.equal(inactive.tasks[0].completed, false)
    assert.equal(inactive.completedCount, 0)
  }
  checks.push("Paused/cancelled Todos excluded from active/done and daily candidates; linked daily item does not count complete")

  const question = await expectJson(await api.post("/api/questions", { data: { promptMarkdown: "Read-only question", referenceAnswerMarkdown: "Read-only answer" } }), 201)
  const questionBefore = await prisma.question.findUniqueOrThrow({ where: { id: question.id } })
  for (let index = 0; index < 3; index++) await expectJson(await api.get(`/api/questions/${question.id}`))
  assert.deepEqual(await prisma.question.findUniqueOrThrow({ where: { id: question.id } }), questionBefore)
  assert.equal(await prisma.questionReviewLog.count(), 0)
  assert.equal(await prisma.questionReviewTicket.count(), 0)
  checks.push("Question browse GET does not mutate schedule or create reviews/tickets")

  const home = await api.get("/admin")
  assert.equal(home.status(), 200)
  const homeHtml = await home.text()
  for (const label of ["工作台", "先记下来", "最近素材", "继续讨论", "今天想做的事", marker]) assert.ok(homeHtml.includes(label), label)
  const resumeSection = (html: string) => {
    const section = html.match(/<section\b[^>]*aria-labelledby="resume-discussion-heading"[^>]*>[\s\S]*?<\/section>/)?.[0]
    assert.ok(section, "Discussion resume section must be rendered")
    return section
  }
  assert.ok(resumeSection(homeHtml).includes(firstId), "WANT_DISCUSS remains resumable")
  assert.ok(!resumeSection(homeHtml).includes(secondId), "Archived material must not appear in resume")
  await expectJson(await api.patch(`/api/ideas/${firstId}`, { data: { discussionStatus: "DISCUSSED" } }))
  const discussedHome = await api.get("/admin")
  assert.equal(discussedHome.status(), 200)
  const discussedResume = resumeSection(await discussedHome.text())
  assert.ok(discussedResume.includes(firstId), "Saving DISCUSSED must retain the resume entry")
  assert.ok(discussedResume.includes("先聊 Agent 原理，不转成七项任务"), "Resume must show the last discussion summary")
  await expectJson(await api.patch(`/api/ideas/${firstId}`, { data: { discussionStatus: "ARCHIVED" } }))
  const archivedHome = await api.get("/admin")
  assert.equal(archivedHome.status(), 200)
  assert.ok(!resumeSection(await archivedHome.text()).includes(firstId), "Archiving must remove the resume entry")
  await expectJson(await api.patch(`/api/ideas/${firstId}`, { data: { discussionStatus: "DISCUSSED" } }))
  checks.push("Recent discussion resume retains discussed material with summary and excludes archived material")
  const ideaPage = await api.get(`/admin/ideas/${firstId}`)
  assert.equal(ideaPage.status(), 200)
  const ideaHtml = await ideaPage.text()
  writeFileSync("test-results/material-http-idea.html", ideaHtml)
  assert.ok(ideaHtml.includes("一本书"))
  assert.ok(!ideaHtml.includes("<img src=x onerror=alert(1)>"))
  assert.ok(ideaHtml.includes(convertedTodo.targetId))
  const renderedIdeaHtml = ideaHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  const original = renderedIdeaHtml.match(/<details\b[^>]*>[\s\S]*?原始输入（只读）[\s\S]*?<\/details>/)
  assert.ok(original, "Read-only original input must be present")
  assert.match(original[0].split(">", 1)[0], /\bopen(?:=|\s|$)/, "Original input is expanded by default")
  for (const provenance of ["http-acceptance", "收录于", "一本书"]) assert.ok(original[0].includes(provenance), provenance)
  const readingArticle = renderedIdeaHtml.match(/<article\b[^>]*aria-label="Idea 阅读"[^>]*>[\s\S]*?<\/article>/)
  assert.ok(readingArticle, "Actual reading article must be rendered")
  assert.ok(readingArticle[0].includes('aria-label="讨论摘要"'), "Summary is in the visible reading article")
  assert.ok(readingArticle[0].includes("人工整理内容"), "Derived body is in the visible reading article")
  // RSC may serialize derived content before the HTML. Compare rendered element
  // positions, never the first text occurrence in the entire streamed response.
  assert.ok(original.index! + original[0].length <= readingArticle.index!, "Expanded original precedes the entire derived reading article")
  checks.push("Expanded immutable original/source/time render before discussion summary and derived content")
  const postList = await api.get("/admin/posts?status=DRAFT&q=" + marker)
  assert.equal(postList.status(), 200)
  assert.ok((await postList.text()).includes("status%3DDRAFT"))
  const postPage = await api.get(`/admin/posts/${convertedPost.targetId}`)
  assert.equal(postPage.status(), 200)
  assert.ok((await postPage.text()).includes(secondId))
  checks.push("Authenticated backend home/material/raw/backlink SSR and draft filter return context render successfully")

  await prisma.post.create({ data: { title: "HTTP_PUBLIC_ARTICLE", content: "Published fixture only", slug: "http-public-article", tags: [], status: "PUBLISHED", publishedAt: new Date() } })
  for (const path of ["/zh", "/zh/blog", "/zh/blog?search=" + marker, "/feed.xml", "/sitemap.xml", "/api/projects", "/api/settings?keys=owner_name,home_tagline"]) {
    const response = await anonymous.get(path)
    assert.equal(response.status(), 200, path)
    const body = await response.text()
    // Public search legitimately echoes the visitor-supplied query, not private results.
    if (path.includes("?search=")) {
      for (const privateText of ["解读标题", "private draft", "一本书", "人工整理内容"]) {
        assert.ok(!body.includes(privateText), `Private content leaked at ${path}`)
      }
    } else assert.ok(!body.includes(marker), `Private sentinel leaked at ${path}`)
    if (path === "/zh/blog") { assert.ok(body.includes("HTTP_PUBLIC_ARTICLE")); assert.ok(body.includes("搜索")) }
    if (path === "/feed.xml") assert.ok(body.includes("HTTP_PUBLIC_ARTICLE"))
  }
  const draft = await prisma.post.findUniqueOrThrow({ where: { id: convertedPost.targetId } })
  const draftPublic = await anonymous.get(`/zh/blog/${draft.slug}`)
  const draftHtml = await draftPublic.text()
  // Next's existing loading boundary can stream a 200 shell before notFound().
  // Require not-found semantics and no draft data; report transport status honestly.
  assert.ok([200, 404].includes(draftPublic.status()))
  assert.ok(!draftHtml.includes(draft.title))
  assert.ok(!draftHtml.includes(draft.content))
  assert.match(draftHtml, /noindex|NEXT_HTTP_ERROR_FALLBACK;404/)
  checks.push(`Public draft content withheld with not-found response; observed HTTP ${draftPublic.status()} (existing streamed shell)`)

  const anonymousAdmin = await anonymous.get("/admin", { maxRedirects: 0 })
  assert.ok([302, 303, 307, 308].includes(anonymousAdmin.status()))
  assert.ok(!(await anonymousAdmin.text()).includes(marker))
  checks.push("Public navigation/search/feed/sitemap/APIs retain published content and exclude all private sentinels")
  console.log(JSON.stringify({ passed: true, scope: "Actual HTTP/API + server-rendered HTML, not browser interaction", checks }, null, 2))
  await prisma.$disconnect()
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  await disconnectDatabase()
  await api?.dispose()
  await anonymous?.dispose()
  if (server && server.exitCode === null) {
    server.kill("SIGTERM")
    await new Promise<void>(resolve => { server!.once("exit", () => resolve()); setTimeout(resolve, 5_000) })
  }
})
