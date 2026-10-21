import assert from "node:assert/strict"
import test from "node:test"
import {
  ideaDocumentHref, ideaListHref, ideaListPositionKey, readIdeaListFilters,
  readIdeaListPosition, safeIdeaReturnHref,
} from "../lib/idea-list-navigation"

test("Idea list filters round-trip Chinese, literal symbols and project identity through return links", () => {
  const filters = { q: " Cloud2BIM 中文 + & # ", tag: "图形/结构", projectId: "project-123" }
  const href = ideaListHref(filters)
  const expected = { ...filters, q: filters.q.trim() }
  assert.deepEqual(readIdeaListFilters(new URL(href, "https://example.test").searchParams), expected)
  for (const edit of [false, true]) {
    const detail = new URL(ideaDocumentHref("idea/one", href, edit), "https://example.test")
    assert.equal(detail.pathname, "/admin/ideas/idea%2Fone")
    assert.equal(detail.searchParams.get("returnTo"), href)
    assert.equal(detail.searchParams.has("edit"), edit)
    assert.equal(safeIdeaReturnHref(detail.searchParams.get("returnTo")), href)
  }
})

test("Idea return destination cannot escape to another origin or private route", () => {
  for (const value of [undefined, [], "https://attacker.invalid/admin/ideas?q=secret", "//attacker.invalid/admin/ideas", "/admin/posts?q=secret", "javascript:alert(1)", "/admin/ideas/other"]) {
    assert.equal(safeIdeaReturnHref(value), "/admin/ideas")
  }
  assert.equal(safeIdeaReturnHref("/admin/ideas?unknown=ignored&tag=keep#ignored"), "/admin/ideas?tag=keep")
})

test("Clearing individual filters and resetting all produce explicit canonical routes", () => {
  assert.equal(ideaListHref({ q: "", tag: "BIM", projectId: "p" }), "/admin/ideas?tag=BIM&projectId=p")
  assert.equal(ideaListHref({ q: "", tag: "", projectId: "" }), "/admin/ideas")
  assert.equal(ideaDocumentHref("new", "/admin/ideas"), "/admin/ideas/new")
  assert.equal(ideaDocumentHref("one", "/admin/ideas", true), "/admin/ideas/one?edit=1")
})

test("List scroll positions are owner/filter scoped and malformed stored values fall back safely", () => {
  assert.notEqual(ideaListPositionKey("owner-a", "/admin/ideas?q=BIM"), ideaListPositionKey("owner-b", "/admin/ideas?q=BIM"))
  assert.notEqual(ideaListPositionKey("owner-a", "/admin/ideas?q=BIM"), ideaListPositionKey("owner-a", "/admin/ideas?q=Cloud"))
  assert.equal(readIdeaListPosition("480"), 480)
  for (const value of [null, "NaN", "Infinity", "-1", "10000001", "{}"])
    assert.equal(readIdeaListPosition(value), 0)
})
