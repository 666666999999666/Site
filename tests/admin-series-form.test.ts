import assert from "node:assert/strict"
import test from "node:test"
import type { Series } from "../lib/generated/prisma/client"
import { seriesDraft, seriesMutationInput } from "../components/admin/series-form"

const validDraft = { title: "  Title  ", slug: "  ", description: "  Description  ", coverImage: "  ", sortOrder: "0" }

test("series create omits blank slug while edits require one", () => {
  assert.deepEqual(seriesMutationInput(validDraft, "create"), {
    title: "Title", description: "Description", coverImage: null, sortOrder: 0,
  })
  assert.throws(() => seriesMutationInput(validDraft, "edit"), { message: "系列标题、slug 和简介均为必填项" })
  for (const mode of ["create", "edit"] as const) {
    assert.deepEqual(seriesMutationInput({ ...validDraft, slug: "  title-slug  ", coverImage: " /uploads/cover.webp ", sortOrder: " -10 " }, mode), {
      title: "Title", slug: "title-slug", description: "Description", coverImage: "/uploads/cover.webp", sortOrder: -10,
    })
    for (const field of ["title", "description"]) {
      assert.throws(() => seriesMutationInput({ ...validDraft, slug: "slug", [field]: "  " }, mode), {
        message: mode === "create" ? "系列标题和简介均为必填项" : "系列标题、slug 和简介均为必填项",
      })
    }
  }
})

test("series order retains Number conversion and inclusive integer bounds", () => {
  for (const [value, expected] of [["", 0], [" -10000 ", -10000], ["10000", 10000], ["1e2", 100]] as const) {
    assert.equal(seriesMutationInput({ ...validDraft, sortOrder: value }, "create").sortOrder, expected)
  }
  for (const value of ["10001", "-10001", "1.5", "bad", "Infinity"]) {
    assert.throws(() => seriesMutationInput({ ...validDraft, sortOrder: value }, "create"), { message: "系列排序必须是 -10000 到 10000 之间的整数" })
  }
})

test("series drafts preserve server values and reset all five fields", () => {
  assert.deepEqual(seriesDraft(), { title: "", slug: "", description: "", coverImage: "", sortOrder: "0" })
  assert.deepEqual(seriesDraft({ title: "Title", slug: "slug", description: null, coverImage: null, sortOrder: -5 } as unknown as Series), {
    title: "Title", slug: "slug", description: "", coverImage: "", sortOrder: "-5",
  })
})
