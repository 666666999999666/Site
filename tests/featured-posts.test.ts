import assert from "node:assert/strict"
import test from "node:test"
import * as nextServer from "next/server"
import * as adminMutation from "../lib/api/admin-mutation"
import * as privateResponse from "../lib/api/private-response"
import * as errors from "../lib/errors"
import * as validation from "../lib/validation"
import * as featured from "../lib/featured-posts"
import { loadRoute } from "./helpers/load-route"

test("featured selection accepts zero to three ordered IDs without duplicates", () => {
  assert.deepEqual(featured.validateFeaturedPostIds({ ids: [] }), [])
  assert.deepEqual(featured.validateFeaturedPostIds({ ids: ["post-c", "post-a", "post-b"] }), ["post-c", "post-a", "post-b"])
  for (const input of [null, [], {}, { ids: "post-a" }, { ids: ["a", "b", "c", "d"] }, { ids: ["a", "a"] }, { ids: [" "] }, { ids: ["/uploads/a.png"] }, { ids: [42] }, { ids: [], title: "do not edit" }]) {
    assert.throws(() => featured.validateFeaturedPostIds(input), errors.ValidationError)
  }
})

test("missing or malformed stored selection is empty without a latest-post fallback", () => {
  for (const value of [null, undefined, "", "not-json", "{}", '["a","a"]', '["a","b","c","d"]']) {
    assert.deepEqual(featured.parseFeaturedPostIds(value), [])
  }
  assert.deepEqual(featured.parseFeaturedPostIds('["b","a"]'), ["b", "a"])
})

test("public selection keeps configured order and excludes draft, missing and unrelated records", () => {
  const posts: featured.FeaturedPostOption[] = [
    { id: "a", status: "PUBLISHED", title: "Original A" },
    { id: "draft", status: "DRAFT", title: "Private draft" },
    { id: "b", status: "PUBLISHED", title: "Original B" },
    { id: "latest", status: "PUBLISHED", title: "Unselected latest" },
  ]
  assert.deepEqual(featured.orderPublishedFeaturedPosts(["b", "draft", "deleted", "a"], posts), [posts[2], posts[0]])
  assert.deepEqual(featured.orderPublishedFeaturedPosts([], posts), [])
  assert.throws(() => featured.assertPublishedFeaturedPosts(["draft"], posts), errors.ValidationError)
  assert.throws(() => featured.assertPublishedFeaturedPosts(["deleted"], posts), errors.ValidationError)
  assert.doesNotThrow(() => featured.assertPublishedFeaturedPosts([], posts))
  assert.doesNotThrow(() => featured.assertPublishedFeaturedPosts(["b", "a"], posts))
})

test("featured search trims input and bounds its length", () => {
  assert.equal(featured.validateFeaturedPostSearch(null), "")
  assert.equal(featured.validateFeaturedPostSearch("  Daemon  "), "Daemon")
  assert.throws(() => featured.validateFeaturedPostSearch("x".repeat(201)), errors.ValidationError)
})

type StoredPost = { id: string; title: string; slug: string; excerpt: string | null; status: "DRAFT" | "PUBLISHED" }
type FindInput = { where: { id?: { in: string[] }; status?: string; title?: { contains: string } }; take?: number; select: Record<string, boolean> }
type FeaturedStore = {
  getFeaturedPosts(): Promise<featured.FeaturedPost[]>
  getFeaturedPostsAdminState(query?: string): Promise<featured.FeaturedPostsAdminState>
  saveFeaturedPosts(ids: string[]): Promise<void>
}

function storeHarness(initial: string | null = '["b","a"]') {
  const state = { value: initial, writes: 0, queries: [] as FindInput[] }
  const posts: StoredPost[] = [
    { id: "a", title: "Alpha", slug: "original-alpha", excerpt: "Original alpha summary", status: "PUBLISHED" },
    { id: "b", title: "Beta", slug: "original-beta", excerpt: null, status: "PUBLISHED" },
    { id: "draft", title: "Private draft", slug: "private-draft", excerpt: "Private summary", status: "DRAFT" },
  ]
  const database = {
    post: { findMany: async (input: FindInput) => {
      state.queries.push(input)
      const found = posts.filter((post) => (!input.where.id || input.where.id.in.includes(post.id)) && (!input.where.status || post.status === input.where.status) && (!input.where.title || post.title.toLowerCase().includes(input.where.title.contains.toLowerCase())))
      return found.slice(0, input.take).map((post) => input.select.slug ? { ...post } : { id: post.id, title: post.title, status: post.status })
    } },
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        assert.equal(where.key, featured.FEATURED_POSTS_SETTING_KEY)
        return state.value === null ? null : { key: where.key, value: state.value }
      },
      upsert: async (input: { where: { key: string }; create: { key: string; value: string }; update: { value: string } }) => {
        assert.equal(input.where.key, featured.FEATURED_POSTS_SETTING_KEY)
        assert.equal(input.create.key, featured.FEATURED_POSTS_SETTING_KEY)
        assert.equal(input.create.value, input.update.value)
        state.value = input.update.value
        state.writes++
      },
    },
  }
  const prisma = { ...database, $transaction: async (action: (transaction: typeof database) => Promise<void>) => action(database) }
  const store = loadRoute<FeaturedStore>("lib/featured-posts-store.ts", { "./db": { prisma }, "./featured-posts": featured })
  return { state, posts, store }
}

test("public store queries only configured published articles and returns original summaries and links", async () => {
  const { state, posts, store } = storeHarness()
  assert.deepEqual(await store.getFeaturedPosts(), [posts[1], posts[0]].map(({ id, title, slug, excerpt }) => ({ id, title, slug, excerpt })))
  assert.deepEqual(state.queries[0].where, { id: { in: ["b", "a"] }, status: "PUBLISHED" })
  assert.deepEqual(state.queries[0].select, { id: true, title: true, slug: true, excerpt: true, status: true })
  posts[1].status = "DRAFT"
  assert.deepEqual((await store.getFeaturedPosts()).map((post) => post.id), ["a"])
  posts.splice(0, 1)
  assert.deepEqual(await store.getFeaturedPosts(), [])
  assert.equal(state.writes, 0)
})

test("empty and corrupt selections never query articles", async () => {
  for (const initial of [null, "[]", "corrupt"]) {
    const { state, store } = storeHarness(initial)
    assert.deepEqual(await store.getFeaturedPosts(), [])
    assert.equal(state.queries.length, 0)
  }
})

test("admin state retains stale selected IDs for removal and searches published candidates only", async () => {
  const { store } = storeHarness('["draft","deleted","b"]')
  const result = await store.getFeaturedPostsAdminState("beTA")
  assert.deepEqual(result.selected, [
    { id: "draft", title: "Private draft", status: "DRAFT" },
    { id: "deleted", title: "文章已删除", status: "MISSING" },
    { id: "b", title: "Beta", status: "PUBLISHED" },
  ])
  assert.deepEqual(result.candidates.map((post) => post.id), ["b"])
})

test("save persists ordered IDs only; repeat, cancel and clear preserve original articles", async () => {
  const { state, posts, store } = storeHarness()
  const original = structuredClone(posts)
  await store.saveFeaturedPosts(["a", "b"])
  assert.equal(state.value, '["a","b"]')
  await store.saveFeaturedPosts(["a", "b"])
  assert.equal(state.value, '["a","b"]')
  await store.saveFeaturedPosts(["b"])
  assert.equal(state.value, '["b"]')
  await store.saveFeaturedPosts([])
  assert.equal(state.value, "[]")
  assert.deepEqual(posts, original)
})

test("save rejects drafts and deleted articles before changing settings", async () => {
  const { state, store } = storeHarness()
  await assert.rejects(() => store.saveFeaturedPosts(["draft"]), errors.ValidationError)
  await assert.rejects(() => store.saveFeaturedPosts(["deleted"]), errors.ValidationError)
  assert.equal(state.value, '["b","a"]')
  assert.equal(state.writes, 0)
})

type Handler = (request: nextServer.NextRequest) => Promise<nextServer.NextResponse>

function apiHarness() {
  const state = { loggedIn: true, calls: 0, saved: [] as string[], query: "" }
  const route = loadRoute<{ GET: Handler; PUT: Handler }>("app/api/settings/featured-posts/route.ts", {
    "next/server": nextServer,
    "@/lib/api/auth": { ensureAuthenticated: async () => { if (!state.loggedIn) throw new errors.AuthError("未登录") } },
    "@/lib/api/admin-mutation": adminMutation,
    "@/lib/api/private-response": privateResponse,
    "@/lib/validation": validation,
    "@/lib/featured-posts": featured,
    "@/lib/featured-posts-store": {
      getFeaturedPostsAdminState: async (query: string) => { state.calls++; state.query = query; return { selected: [], candidates: [] } },
      saveFeaturedPosts: async (ids: string[]) => { state.calls++; state.saved = ids },
    },
  })
  const invoke = (method: "GET" | "PUT", body = '{"ids":[]}', headers: Record<string, string> = {}, query = "") => route[method](new nextServer.NextRequest(`https://liaoqizai.site/api/settings/featured-posts${query}`, {
    method,
    headers: { origin: "https://liaoqizai.site", "content-type": "application/json", ...headers },
    ...(method === "PUT" ? { body } : {}),
  }))
  return { state, invoke }
}

test("featured API authenticates both read and write before parsing or touching storage", async () => {
  const { state, invoke } = apiHarness()
  state.loggedIn = false
  for (const method of ["GET", "PUT"] as const) {
    const response = await invoke(method, "{", { origin: "https://attacker.test", "content-type": "text/plain" })
    assert.equal(response.status, 401)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.deepEqual(await response.json(), { error: "未登录", code: "AUTH_ERROR" })
  }
  assert.equal(state.calls, 0)
})

test("featured API rejects foreign origins, malformed requests and excess/unknown inputs", async () => {
  const { state, invoke } = apiHarness()
  const cases: [string, Record<string, string>, number][] = [
    ['{"ids":[]}', { origin: "https://attacker.test" }, 403],
    ['{"ids":[]}', { "content-type": "text/plain" }, 400],
    ["{", {}, 400],
    ['{"ids":[],"other":true}', {}, 400],
    ['{"ids":["a","b","c","d"]}', {}, 400],
    ['{"ids":["a","a"]}', {}, 400],
  ]
  for (const [body, headers, status] of cases) {
    const response = await invoke("PUT", body, headers)
    assert.equal(response.status, status)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
  }
  assert.equal((await invoke("GET", undefined, {}, `?q=${"x".repeat(201)}`)).status, 400)
  assert.equal(state.calls, 0)
})

test("featured API serves bounded search and saves the exact requested order privately", async () => {
  const { state, invoke } = apiHarness()
  const get = await invoke("GET", undefined, {}, "?q=%20Beta%20")
  assert.equal(get.status, 200)
  assert.equal(state.query, "Beta")
  assert.deepEqual(await get.json(), { selected: [], candidates: [] })
  const put = await invoke("PUT", '{"ids":["b","a"]}')
  assert.equal(put.status, 200)
  assert.equal(put.headers.get("cache-control"), "private, no-store")
  assert.deepEqual(await put.json(), { ok: true })
  assert.deepEqual(state.saved, ["b", "a"])
})
