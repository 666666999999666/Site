import assert from "node:assert/strict"
import test from "node:test"
import { resolvePublishedAt } from "../lib/post-policy"

const original = new Date("2026-07-01T01:00:00.000Z")
const now = new Date("2026-07-29T01:00:00.000Z")

test("drafts never retain a publish time", () => {
  assert.equal(resolvePublishedAt({
    existing: { status: "PUBLISHED", publishedAt: original },
    nextStatus: "DRAFT",
    now,
  }), null)
})

test("first publication defaults to server time", () => {
  assert.equal(resolvePublishedAt({
    existing: { status: "DRAFT", publishedAt: null },
    nextStatus: "PUBLISHED",
    now,
  })?.toISOString(), now.toISOString())
})

test("updating a published post preserves its original publish time", () => {
  assert.equal(resolvePublishedAt({
    existing: { status: "PUBLISHED", publishedAt: original },
    nextStatus: "PUBLISHED",
    requestedPublishedAt: null,
    now,
  })?.toISOString(), original.toISOString())
})

test("an explicit valid publish time wins", () => {
  const requested = new Date("2026-08-01T04:00:00.000Z")
  assert.equal(resolvePublishedAt({
    existing: { status: "PUBLISHED", publishedAt: original },
    nextStatus: "PUBLISHED",
    requestedPublishedAt: requested,
    now,
  })?.toISOString(), requested.toISOString())
})
