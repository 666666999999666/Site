import assert from "node:assert/strict"
import test from "node:test"
import {
  EMPTY_QUESTION_NAVIGATION,
  questionEditorURL,
  questionNewURL,
  questionPageURL,
  questionReturnTo,
  readQuestionNavigation,
} from "../lib/questions/navigation"

const library = { tab: "library" as const, query: "daemon 中文 & worker", status: "NEW", rating: "NONE", page: 2 }

test("question navigation round-trips the tab, Unicode query, both filters and page", () => {
  const href = questionPageURL(library)
  assert.deepEqual(readQuestionNavigation(new URL(href, "https://example.test").searchParams), library)
  assert.equal(questionPageURL(EMPTY_QUESTION_NAVIGATION), "/admin/questions")
})

test("question filter state survives a tab change and reset returns to page one", () => {
  const today = questionPageURL({ ...library, tab: "today" })
  const state = readQuestionNavigation(new URL(today, "https://example.test").searchParams)
  assert.deepEqual(state, { ...library, tab: "today" })
  assert.equal(questionPageURL({ ...EMPTY_QUESTION_NAVIGATION, tab: "library" }), "/admin/questions?tab=library")
})

test("question navigation bounds malformed query values before sending API filters", () => {
  const state = readQuestionNavigation(new URLSearchParams({ tab: "elsewhere", q: "😀".repeat(201), status: "invalid", rating: "other", page: "Infinity" }))
  assert.equal(state.tab, "today")
  assert.equal(Array.from(state.query).length, 200)
  assert.equal(state.status, "")
  assert.equal(state.rating, "")
  for (const value of ["0", "-1", "2.5", "1000001", "9007199254740993"]) assert.equal(readQuestionNavigation(new URLSearchParams({ page: value })).page, 1)
  assert.deepEqual(readQuestionNavigation(new URLSearchParams({ status: "new", rating: "none", page: "02" })), { ...EMPTY_QUESTION_NAVIGATION, status: "NEW", rating: "NONE", page: 2 })
})

test("question return addresses are confined to the list and a safe row anchor", () => {
  const href = questionPageURL(library) + "#question-safe-id_12"
  assert.equal(questionReturnTo(href), href)
  for (const value of ["https://evil.invalid/admin/questions", "//evil.invalid/admin/questions", "/admin/questions/../settings", "/api/questions", "javascript:alert(1)", [href], null]) assert.equal(questionReturnTo(value), "/admin/questions")
  assert.equal(questionReturnTo("/admin/questions?tab=library&unknown=discard#other"), "/admin/questions?tab=library")
})

test("editing and creating carry the same local return context without unsafe path interpolation", () => {
  const returnTo = questionPageURL(library) + "#question-row-1"
  const edit = new URL(questionEditorURL("row/one", returnTo), "https://example.test")
  assert.equal(edit.pathname, "/admin/questions/row%2Fone")
  assert.equal(edit.searchParams.get("returnTo"), returnTo)
  const create = new URL(questionNewURL(returnTo), "https://example.test")
  assert.equal(create.pathname, "/admin/questions/new")
  assert.equal(create.searchParams.get("returnTo"), returnTo)
  assert.equal(new URL(questionEditorURL("row", "https://evil.invalid"), "https://example.test").searchParams.get("returnTo"), "/admin/questions")
})
