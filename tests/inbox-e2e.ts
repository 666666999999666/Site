import assert from "node:assert/strict"
import { chromium, request } from "@playwright/test"

function requiredEnvironment(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertLocalBaseUrl(value: string) {
  const url = new URL(value)
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) {
    throw new Error("Inbox E2E tests only run against a local web server")
  }
  return url.origin
}

async function main() {
  if (process.env.INBOX_E2E_CONFIRM_ISOLATED_DB !== "true") {
    throw new Error("Set INBOX_E2E_CONFIRM_ISOLATED_DB=true only after verifying the server uses a disposable test database")
  }
  const baseURL = assertLocalBaseUrl(requiredEnvironment("INBOX_TEST_BASE_URL"))
  const password = requiredEnvironment("INBOX_TEST_PASSWORD")
  const requestKey = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const rawInput = 'idea：<img src=x onerror="window.__inboxXss=1"> 私人原文'
  let createdIdeaHref = ""

  const api = await request.newContext({ baseURL })
  try {
    const unauthenticated = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL },
      data: { rawInput, requestKey },
    })
    assert.equal(unauthenticated.status(), 401)
    assert.match(unauthenticated.headers()["cache-control"] ?? "", /private.*no-store/)

    const login = await api.post("/api/auth/login", {
      headers: { Origin: baseURL },
      data: { password },
    })
    assert.equal(login.status(), 200, await login.text())

    const invalidOrigin = await api.post("/api/inbox/items", {
      headers: { Origin: "https://attacker.invalid" },
      data: { rawInput, requestKey },
    })
    assert.equal(invalidOrigin.status(), 403)
    assert.match(invalidOrigin.headers()["cache-control"] ?? "", /private.*no-store/)

    const invalidContentType = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL, "Content-Type": "text/plain" },
      data: JSON.stringify({ rawInput, requestKey }),
    })
    assert.equal(invalidContentType.status(), 400)

    const beforeInvalid = await api.get("/api/inbox/items")
    assert.equal(beforeInvalid.status(), 200)
    const beforeCount = (await beforeInvalid.json() as unknown[]).length
    const invalidPrefix = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL },
      data: { rawInput: "学习：第一版不支持", requestKey: `${requestKey}-invalid` },
    })
    assert.equal(invalidPrefix.status(), 422)
    const afterInvalid = await api.get("/api/inbox/items")
    assert.equal((await afterInvalid.json() as unknown[]).length, beforeCount)

    const created = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL },
      data: { rawInput, requestKey },
    })
    assert.equal(created.status(), 201, await created.text())
    assert.match(created.headers()["cache-control"] ?? "", /private.*no-store/)
    const item = await created.json() as {
      id: string
      rawInput: string
      status: string
      execution: { targetId: string; targetHref: string }
    }
    assert.equal(item.rawInput, rawInput)
    assert.equal(item.status, "APPLIED")
    assert.match(item.execution.targetHref, /^\/admin\/ideas\//)
    createdIdeaHref = item.execution.targetHref

    const duplicate = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL },
      data: { rawInput, requestKey },
    })
    assert.equal(duplicate.status(), 201)
    const duplicateItem = await duplicate.json() as typeof item
    assert.equal(duplicateItem.id, item.id)
    assert.equal(duplicateItem.execution.targetId, item.execution.targetId)

    const detail = await api.get(`/api/inbox/items/${encodeURIComponent(item.id)}`)
    assert.equal(detail.status(), 200)
    assert.match(detail.headers()["cache-control"] ?? "", /private.*no-store/)
    const missing = await api.get("/api/inbox/items/not-a-real-item")
    assert.equal(missing.status(), 404)
    const unknownFilter = await api.get("/api/inbox/items?ownerId=someone-else")
    assert.equal(unknownFilter.status(), 400)

    const retryApplied = await api.post(
      `/api/inbox/items/${encodeURIComponent(item.id)}/retry`,
      { headers: { Origin: baseURL }, data: {} }
    )
    assert.equal(retryApplied.status(), 200)
    assert.equal((await retryApplied.json() as typeof item).execution.targetId, item.execution.targetId)

    const article = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL },
      data: {
        rawInput: "文章：https://example.com/reference",
        requestKey: `${requestKey}-article`,
      },
    })
    assert.equal(article.status(), 201)
    const articleItem = await article.json() as typeof item
    const post = await api.get(`/api/posts/${encodeURIComponent(articleItem.execution.targetId)}`)
    assert.equal(post.status(), 200)
    assert.match(post.headers()["cache-control"] ?? "", /private.*no-store/)
    const postBody = await post.json() as { title: string; content: string; status: string; publishedAt: string | null }
    assert.equal(postBody.title, "待整理：example.com")
    assert.equal(postBody.content, "https://example.com/reference")
    assert.equal(postBody.status, "DRAFT")
    assert.equal(postBody.publishedAt, null)
    const crossOriginPostUpdate = await api.put(
      `/api/posts/${encodeURIComponent(articleItem.execution.targetId)}`,
      { headers: { Origin: "https://attacker.invalid" }, data: { title: "不能越权修改" } }
    )
    assert.equal(crossOriginPostUpdate.status(), 403)
    const wrongTypePostUpdate = await api.put(
      `/api/posts/${encodeURIComponent(articleItem.execution.targetId)}`,
      {
        headers: { Origin: baseURL, "Content-Type": "text/plain" },
        data: JSON.stringify({ title: "错误类型" }),
      }
    )
    assert.equal(wrongTypePostUpdate.status(), 400)

    const todo = await api.post("/api/inbox/items", {
      headers: { Origin: baseURL },
      data: {
        rawInput: "todo：E2E Todo\n第二行描述",
        requestKey: `${requestKey}-todo`,
      },
    })
    assert.equal(todo.status(), 201)
    const todoItem = await todo.json() as typeof item
    const todos = await api.get("/api/todos")
    const formalTodo = (await todos.json() as Array<{
      id: string
      priority: number | null
      dueDate: string | null
      projectId: string | null
      description: string | null
    }>).find((candidate) => candidate.id === todoItem.execution.targetId)
    assert.ok(formalTodo)
    assert.equal(formalTodo.id, todoItem.execution.targetId)
    assert.equal(formalTodo.priority, null)
    assert.equal(formalTodo.dueDate, null)
    assert.equal(formalTodo.projectId, null)
    assert.equal(formalTodo.description, "第二行描述")
  } finally {
    await api.dispose()
  }

  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const context = await browser.newContext({ baseURL })
    const login = await context.request.post("/api/auth/login", {
      headers: { Origin: baseURL },
      data: { password },
    })
    assert.equal(login.status(), 200)
    const page = await context.newPage()
    await page.goto("/admin/inbox")
    await page.getByRole("heading", { name: "智能收件箱", exact: true }).waitFor()
    await page.getByText("Idea", { exact: true }).first().waitFor()
    await page.getByText("Todo", { exact: true }).first().waitFor()
    const targetLink = page.locator(`a[href="${createdIdeaHref}"]`)
    await targetLink.waitFor()
    const card = targetLink.locator("xpath=ancestor::*[@data-slot='card'][1]")
    await card.locator("summary").click()
    await card.locator("pre").waitFor()
    assert.match(await card.locator("pre").innerText(), /<img src=x onerror=/)
    assert.equal(await page.locator('img[src="x"]').count(), 0)
    assert.equal(await page.evaluate(() => (window as typeof window & { __inboxXss?: number }).__inboxXss), undefined)
    await context.close()
  } finally {
    await browser.close()
  }

  console.log("Inbox API and browser E2E checks passed")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
