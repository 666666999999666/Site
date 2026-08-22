import assert from "node:assert/strict"
import test from "node:test"
import {
  InboxRequestError,
  validateInboxCaptureBody,
  validateInboxDeleteBody,
  validateInboxListQuery,
  validateInboxRetryBody,
} from "../lib/inbox-request"
import { getInboxTargetHref, serializeInboxItem } from "../lib/inbox-view"

test("capture input keeps raw text unchanged and trims only the request key", () => {
  const rawInput = "\uFEFF  idea：原文\r\n"
  assert.deepEqual(validateInboxCaptureBody({ rawInput, requestKey: " key-1 " }), {
    rawInput,
    requestKey: "key-1",
  })
})

test("capture, retry, and delete inputs reject unknown fields", () => {
  assert.throws(
    () => validateInboxCaptureBody({ rawInput: "idea：内容", requestKey: "key-1", kind: "IDEA" }),
    (error) => error instanceof InboxRequestError && error.statusCode === 422
  )
  assert.throws(
    () => validateInboxRetryBody({ rawInput: "cannot replace it" }),
    (error) => error instanceof InboxRequestError && error.statusCode === 422
  )
  assert.throws(
    () => validateInboxDeleteBody({ force: true }),
    (error) => error instanceof InboxRequestError && error.statusCode === 422
  )
  assert.doesNotThrow(() => validateInboxDeleteBody({}))
})

test("list filters accept only documented kinds and statuses", () => {
  assert.deepEqual(
    validateInboxListQuery(new URLSearchParams("kind=IDEA&status=FAILED")),
    { kind: "IDEA", status: "FAILED" }
  )
  assert.throws(() => validateInboxListQuery(new URLSearchParams("kind=ARTICLE")))
  assert.throws(() => validateInboxListQuery(new URLSearchParams("ownerId=someone-else")))
  assert.throws(() => validateInboxListQuery(new URLSearchParams("kind=IDEA&kind=TODO")))
})

test("target links route each formal object to its existing editor", () => {
  assert.equal(getInboxTargetHref("BLOG", "post 1"), "/admin/posts/post%201")
  assert.equal(getInboxTargetHref("IDEA", "idea 1"), "/admin/ideas/idea%201")
  assert.equal(getInboxTargetHref("TODO", "todo 1"), "/admin/todos#todo-todo%201")
})

test("serialized inbox items expose ISO dates and never mutate the raw input", () => {
  const rawInput = "idea：<script>alert(1)</script>"
  const view = serializeInboxItem({
    id: "item-1",
    kind: "IDEA",
    status: "APPLIED",
    rawInput,
    rawSha256: "a".repeat(64),
    parsedBody: "<script>alert(1)</script>",
    parserVersion: 1,
    requestKey: "key-1",
    failureCode: null,
    failureMessage: null,
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    appliedAt: new Date("2026-08-15T00:00:01.000Z"),
    updatedAt: new Date("2026-08-15T00:00:01.000Z"),
    execution: {
      targetType: "IDEA",
      targetId: "idea-1",
      createdAt: new Date("2026-08-15T00:00:01.000Z"),
    },
    events: [],
  })

  assert.equal(view.rawInput, rawInput)
  assert.equal(view.createdAt, "2026-08-15T00:00:00.000Z")
  assert.equal(view.execution?.targetHref, "/admin/ideas/idea-1")
})
