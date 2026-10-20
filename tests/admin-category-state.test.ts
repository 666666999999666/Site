import assert from "node:assert/strict"
import test from "node:test"
import type { Category } from "../lib/generated/prisma/client"
import { reconcileCategoryItems } from "../components/admin/useCategories"

test("category reconciliation preserves unrelated items and IDs on rename, clearing both relation fields on delete", () => {
  const oldCategory = { id: "a", name: "Old", sortOrder: 0 } as Category
  const updated = { ...oldCategory, name: "Renamed", sortOrder: 20 }
  const selected = { id: "item-a", categoryId: "a", category: oldCategory, title: "Keep content" }
  const other = { id: "item-b", categoryId: "b", category: null, title: "Other" }
  const ungrouped = { id: "item-c", categoryId: null, category: null, title: "Ungrouped" }
  const items = [selected, other, ungrouped]
  const renamed = reconcileCategoryItems(items, "a", updated)
  assert.deepEqual(renamed[0], { ...selected, category: updated })
  assert.equal(renamed[1], other)
  assert.equal(renamed[2], ungrouped)
  assert.equal(items[0], selected)
  assert.equal(selected.category, oldCategory)
  const removed = reconcileCategoryItems(renamed, "a", null)
  assert.deepEqual(removed[0], { ...selected, categoryId: null, category: null })
  assert.equal(removed[1], other)
  assert.equal(removed[2], ungrouped)
})
