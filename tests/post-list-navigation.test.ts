import assert from "node:assert/strict"
import test from "node:test"
import {
  postDocumentHref, postListHref, postListPositionKey, readPostListFilters,
  readPostListPosition, safePostReturnHref, shouldRestorePostListOnMount,
} from "../lib/post-list-navigation"

test("Article search and existing category state survive read/direct-edit return links", () => {
  const filters = { q: " Cloud2BIM 中文 + & ", categoryId: "category-a" }
  const href = postListHref(filters)
  assert.deepEqual(readPostListFilters(new URL(href, "https://example.test").searchParams), { ...filters, q: filters.q.trim() })
  for (const edit of [false, true]) {
    const detail = new URL(postDocumentHref("post/id", href, edit), "https://example.test")
    assert.equal(detail.pathname, "/admin/posts/post%2Fid")
    assert.equal(detail.searchParams.get("returnTo"), href)
    assert.equal(detail.searchParams.has("edit"), edit)
  }
})

test("Article returnTo only accepts the article list, and cannot redirect to an external/private route", () => {
  for (const value of [undefined, [], "//attacker.invalid/admin/posts", "https://attacker.invalid/admin/posts", "/admin/ideas?q=secret", "/admin/posts/123", "javascript:alert(1)"]) {
    assert.equal(safePostReturnHref(value), "/admin/posts")
  }
  assert.equal(safePostReturnHref("/admin/posts?categoryId=a&unknown=x#ignored"), "/admin/posts?categoryId=a")
})

test("Clearing article search retains category; selecting all restores the default route", () => {
  assert.equal(postListHref({ q: "", categoryId: "a" }), "/admin/posts?categoryId=a")
  assert.equal(postListHref({ q: "", categoryId: "" }), "/admin/posts")
  assert.equal(postDocumentHref("new", "/admin/posts"), "/admin/posts/new")
  assert.equal(postDocumentHref("one", "/admin/posts", true), "/admin/posts/one?edit=1")
})

test("Article scroll storage separates owners and filters and rejects invalid offsets", () => {
  assert.notEqual(postListPositionKey("a", "/admin/posts?q=BIM"), postListPositionKey("b", "/admin/posts?q=BIM"))
  assert.notEqual(postListPositionKey("a", "/admin/posts?q=BIM"), postListPositionKey("a", "/admin/posts?q=Cloud"))
  assert.equal(readPostListPosition("582"), 582)
  for (const value of [null, "NaN", "Infinity", "-1", "10000001", "{}"]) assert.equal(readPostListPosition(value), 0)
})

test("Already-resolved initial article filters must not replay the URL over newly typed search text", () => {
  assert.equal(shouldRestorePostListOnMount({ q: "", categoryId: "" }, new URLSearchParams()), false)
  assert.equal(shouldRestorePostListOnMount(
    { q: "Cloud2BIM", categoryId: "category-a" },
    new URLSearchParams("categoryId=category-a&q=Cloud2BIM"),
  ), false)
})

test("Cached article server props still restore URL state when history changed before mount", () => {
  assert.equal(shouldRestorePostListOnMount({ q: "", categoryId: "" }, new URLSearchParams("q=Cloud2BIM")), true)
  assert.equal(shouldRestorePostListOnMount({ q: "Cloud2BIM", categoryId: "" }, new URLSearchParams("q=Cloud2BIM&categoryId=a")), true)
  assert.equal(shouldRestorePostListOnMount({ q: "Cloud2BIM", categoryId: "a" }, new URLSearchParams()), true)
})


test("Article publication status survives list, detail and history return navigation", () => {
  for (const status of ["DRAFT", "PUBLISHED"] as const) {
    const filters = { q: "学习", categoryId: "a", status }
    const href = postListHref(filters)
    assert.deepEqual(readPostListFilters(new URL(href, "https://example.test").searchParams), filters)
    assert.equal(new URL(postDocumentHref("one", href), "https://example.test").searchParams.get("returnTo"), href)
    assert.equal(safePostReturnHref(href), href)
    assert.equal(shouldRestorePostListOnMount({ q: "学习", categoryId: "a" }, new URL(href, "https://example.test").searchParams), true)
  }
  assert.equal(postListHref({ q: "", categoryId: "", status: "ALL" }), "/admin/posts")
  assert.deepEqual(readPostListFilters(new URLSearchParams("status=PRIVATE")), { q: "", categoryId: "" })
})
