import assert from "node:assert/strict"
import test from "node:test"
import * as nextServer from "next/server"
import * as adminMutation from "../lib/api/admin-mutation"
import * as handler from "../lib/api/handler"
import * as privateResponse from "../lib/api/private-response"
import * as errors from "../lib/errors"
import * as validation from "../lib/validation"
import * as ideaValidation from "../lib/ideas-validation"
import * as inbox from "../lib/inbox"
import * as inboxRequest from "../lib/inbox-request"
import * as inboxView from "../lib/inbox-view"
import * as todoShared from "../app/api/todos/_shared"
import { loadRoute } from "./helpers/load-route"

const record = { id: "record-1", title: "原始标题", content: "原始正文", coverImage: null }
const inboxRecord = {
  id: "inbox-1", kind: "IDEA" as const, status: "APPLIED" as const,
  rawInput: "idea：原文\r\n", rawSha256: "hash", parsedBody: "原文\r\n", parserVersion: 1,
  requestKey: "request-1", failureCode: null, failureMessage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"), appliedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"), execution: null, events: [],
}
const inboxSummary = {
  id: "inbox-1", kind: "IDEA", status: "APPLIED", failureCode: null, failureMessage: null,
  createdAt: "2026-01-01T00:00:00.000Z", appliedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z", execution: null,
}
const inboxDetail = {
  ...inboxSummary, rawInput: "idea：原文\r\n", rawSha256: "hash", parsedBody: "原文\r\n",
  parserVersion: 1, requestKey: "request-1", events: [],
}
const ok = { ok: true }
const unknownField = { error: "不支持的字段：unexpected", code: "VALIDATION_ERROR" }
const unknownIdeaField = { error: "Unrecognized key(s) in object: 'unexpected'", code: "VALIDATION_ERROR" }
const unknownInboxField = { error: "不支持的字段：unexpected", code: "INVALID_INBOX_INPUT" }

type RouteCase = {
  path: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: object
  status?: number
  response: unknown
  validation?: { error: string; code: string }
  validationStatus?: number
  directJson?: boolean
}
const routes: RouteCase[] = [
  { path: "ideas", method: "GET", response: [record] },
  { path: "ideas", method: "POST", body: { title: "Idea", content: "原文" }, status: 201, response: record, validation: unknownIdeaField },
  { path: "ideas/[id]", method: "GET", response: record },
  { path: "ideas/[id]", method: "PATCH", body: { title: "Idea" }, response: record, validation: unknownIdeaField },
  { path: "ideas/[id]", method: "DELETE", body: {}, response: ok, validation: unknownIdeaField },
  { path: "ideas/[id]/conversions", method: "POST", body: { targetType: "BLOG", requestKey: "request-123", title: "文章", content: "原文" }, status: 201, response: record, validation: unknownIdeaField },
  { path: "todos", method: "GET", response: [record] },
  { path: "todos", method: "POST", body: { title: "任务" }, status: 201, response: record, validation: unknownField },
  { path: "todos/[id]", method: "PATCH", body: { title: "任务" }, response: record, validation: unknownField },
  { path: "todos/[id]", method: "DELETE", response: ok },
  { path: "todos/[id]/draft", method: "POST", body: {}, status: 201, response: record, validation: unknownField },
  { path: "todos/[id]/subtasks", method: "GET", response: [record] },
  { path: "todos/[id]/subtasks", method: "POST", body: { title: "子任务" }, status: 201, response: record, validation: unknownField },
  { path: "todos/[id]/subtasks/[subtaskId]", method: "PATCH", body: { completed: true }, response: record, validation: unknownField },
  { path: "todos/[id]/subtasks/[subtaskId]", method: "DELETE", response: ok },
  { path: "inbox/items", method: "GET", response: [inboxSummary] },
  { path: "inbox/items", method: "POST", body: { rawInput: "idea：原文", requestKey: "request-1" }, status: 201, response: inboxDetail, validation: unknownInboxField, validationStatus: 422, directJson: true },
  { path: "inbox/items/[id]", method: "GET", response: inboxDetail },
  { path: "inbox/items/[id]", method: "DELETE", body: {}, response: { success: true }, validation: unknownInboxField, validationStatus: 422, directJson: true },
  { path: "inbox/items/[id]/retry", method: "POST", body: {}, response: inboxDetail, validation: unknownInboxField, validationStatus: 422, directJson: true },
  { path: "posts", method: "GET", response: [record] },
  { path: "posts", method: "POST", body: { title: "文章", content: "原文" }, status: 201, response: record, validation: unknownField },
  { path: "posts/[id]", method: "GET", response: record },
  { path: "posts/[id]", method: "PUT", body: { title: "文章" }, response: record, validation: unknownField },
  { path: "posts/[id]", method: "DELETE", body: {}, response: ok, validation: unknownField },
  { path: "series", method: "GET", response: [record] },
  { path: "series", method: "POST", body: { title: "系列", description: "简介" }, status: 201, response: record, validation: unknownField },
  { path: "series/[id]", method: "PATCH", body: { title: "系列" }, response: record, validation: unknownField },
  { path: "series/[id]", method: "DELETE", response: ok },
]

type RouteHandler = (request: nextServer.NextRequest, context: { params: Promise<{ id: string; subtaskId: string }> }) => Promise<Response>

function routeHarness(route: RouteCase) {
  const state = { authenticated: true, error: undefined as unknown, enabled: true, calls: 0 }
  const storedRecord = route.path.startsWith("inbox/") ? inboxRecord : record
  const result = (value: unknown) => async () => {
    state.calls++
    if (state.error) throw state.error
    return value
  }
  const single = result(storedRecord)
  const list = result([storedRecord])
  const model = { findMany: list, findUnique: single, findFirst: single, create: single, update: single, delete: single }
  const routeModule = loadRoute<Record<string, RouteHandler>>(`app/api/${route.path}/route.ts`, {
    "next/server": nextServer,
    "@/lib/api/auth": { ensureAuthenticated: async () => {
      if (!state.authenticated) throw new errors.AuthError("未登录")
      return { userId: "owner-1" }
    } },
    "@/lib/api/admin-mutation": adminMutation,
    "@/lib/api/handler": handler,
    "@/lib/api/private-response": privateResponse,
    "@/lib/errors": errors,
    "@/lib/validation": validation,
    "@/lib/ideas-validation": ideaValidation,
    "@/lib/inbox": inbox,
    "@/lib/inbox-request": inboxRequest,
    "@/lib/inbox-view": inboxView,
    "@/lib/inbox-feature": { isInboxEnabled: () => state.enabled },
    "@/lib/db": { prisma: { todo: model, todoSubtask: model, inboxItem: model, post: model, series: model } },
    "@/lib/ideas": { createIdea: single, searchIdeas: list, getIdea: single, updateIdea: single, deleteIdea: result(ok), convertIdea: single },
    "@/lib/todos": { todoToDraft: single },
    "@/lib/posts": { createPost: single, searchPosts: list, updatePost: single },
    "@/lib/series": { createSeries: single, updateSeries: single, deleteSeries: result(ok) },
    "@/lib/inbox/service": { captureInboxItem: single, deleteInboxItem: single, retryInboxItem: single },
    "@/lib/content": { extractUploadUrls: () => [] },
    "@/lib/uploads-cleanup": { deleteUploadFiles: async () => undefined },
    "./_shared": todoShared,
    "../_shared": todoShared,
    "../../_shared": todoShared,
    "../../../_shared": todoShared,
  })
  async function invoke(body = JSON.stringify(route.body), headers: Record<string, string> = {}, query = "") {
    const request = new nextServer.NextRequest(`https://liaoqizai.site/api/${route.path}${query}`, {
      method: route.method,
      headers: { origin: "https://liaoqizai.site", "content-type": "application/json", ...headers },
      ...(route.method !== "GET" ? { body } : {}),
    })
    let bodyReads = 0
    const originalJson = request.json.bind(request)
    request.json = () => { bodyReads++; return originalJson() }
    const response = await routeModule[route.method](request, { params: Promise.resolve({ id: "record-1", subtaskId: "subtask-1" }) })
    return { response, bodyReads }
  }
  return { state, invoke }
}

async function assertResponse(response: Response, status: number, payload: unknown) {
  assert.equal(response.status, status)
  assert.deepEqual(await response.json(), payload)
  assert.deepEqual(Object.fromEntries(response.headers), {
    "cache-control": "private, no-store",
    "content-type": "application/json",
  })
}

for (const route of routes) {
  test(`${route.method} /api/${route.path} preserves its private response matrix`, async (context) => {
    const harness = routeHarness(route)
    context.mock.method(console, "error", () => undefined)

    await context.test("success status, payload, and exact headers", async () => {
      const { response } = await harness.invoke()
      await assertResponse(response, route.status ?? 200, route.response)
    })
    await context.test("authentication wins before malformed bodies and invalid request headers", async () => {
      harness.state.authenticated = false
      harness.state.calls = 0
      const { response, bodyReads } = await harness.invoke("{", { origin: "https://attacker.test", "content-type": "text/plain" })
      await assertResponse(response, 401, { error: "未登录", code: "AUTH_ERROR" })
      assert.equal(bodyReads, 0)
      assert.equal(harness.state.calls, 0)
      harness.state.authenticated = true
    })
    if (route.method !== "GET") {
      await context.test("origin policy is enforced before parsing", async () => {
        const { response, bodyReads } = await harness.invoke("{", { origin: "https://attacker.test" })
        await assertResponse(response, 403, { error: "请求来源无效", code: "PERMISSION_DENIED" })
        assert.equal(bodyReads, 0)
      })
      await context.test("content type policy stays route-specific", async () => {
        const { response, bodyReads } = await harness.invoke(undefined, { "content-type": "text/plain" })
        if (route.path === "series/[id]" && route.method === "DELETE") {
          await assertResponse(response, 200, route.response)
        } else {
          await assertResponse(response, 400, { error: "请求必须使用 application/json", code: "VALIDATION_ERROR" })
        }
        assert.equal(bodyReads, 0)
      })
      await context.test("malformed JSON keeps its existing parsing policy", async () => {
        const { response, bodyReads } = await harness.invoke("{")
        if (route.body === undefined) {
          await assertResponse(response, route.status ?? 200, route.response)
          assert.equal(bodyReads, 0)
        } else {
          await assertResponse(response, 400, {
            error: "请求体必须是有效 JSON", code: route.directJson ? "INVALID_JSON" : "VALIDATION_ERROR",
          })
          assert.equal(bodyReads, 1)
        }
      })
    }
    if (route.validation) {
      await context.test("validation errors retain exact status and message", async () => {
        harness.state.calls = 0
        const { response } = await harness.invoke(JSON.stringify({ ...route.body, unexpected: true }))
        await assertResponse(response, route.validationStatus ?? 400, route.validation)
        assert.equal(harness.state.calls, 0)
      })
    }
    await context.test("unexpected service failures conceal details and remain private", async () => {
      harness.state.error = new Error("secret database detail")
      const { response } = await harness.invoke()
      await assertResponse(response, 500, { error: "服务器内部错误", code: "INTERNAL_ERROR" })
    })
  })
}

test("Inbox parser errors retain the dedicated 422 mapping", async () => {
  const harness = routeHarness(routes.find((route) => route.path === "inbox/items" && route.method === "POST")!)
  harness.state.error = new inbox.InboxInputError("INVALID_PREFIX_OR_BODY", "输入必须包含有效前缀和正文")
  await assertResponse((await harness.invoke()).response, 422, { error: "输入必须包含有效前缀和正文", code: "INVALID_PREFIX_OR_BODY" })
})

test("Inbox feature gate remains after authentication and before request parsing", async () => {
  const harness = routeHarness(routes.find((route) => route.path === "inbox/items" && route.method === "POST")!)
  harness.state.enabled = false
  const { response, bodyReads } = await harness.invoke("{")
  await assertResponse(response, 503, { error: "智能收件箱尚未启用", code: "CONFIGURATION_ERROR" })
  assert.equal(bodyReads, 0)
  assert.equal(harness.state.calls, 0)
})
