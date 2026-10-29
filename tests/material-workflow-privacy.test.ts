import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
test("material capture/provenance remains separate from public output models", () => {
  for (const file of ["app/feed.xml/route.ts", "app/sitemap.ts"]) {
    const source = readFileSync(file,"utf8")
    assert.doesNotMatch(source,/prisma\.idea|rawInput|discussionSummary/)
    assert.match(source,/PUBLISHED/)
  }
  const migration = readFileSync("prisma/migrations/20261028150000_private_material_workflow/migration.sql","utf8")
  assert.match(migration,/CREATE TRIGGER "Idea_provenance_immutable"/)
  assert.doesNotMatch(migration,/DELETE FROM|DROP TABLE|UPDATE "Project"/)
})


test("material detail presents expanded provenance before discussion and editable interpretation", () => {
  const source = readFileSync("components/admin/IdeaForm.tsx", "utf8")
  const raw = source.indexOf("原始输入（只读）")
  assert.ok(raw > 0)
  assert.match(source.slice(0, raw), /<details open /)
  assert.ok(raw < source.indexOf('aria-label="讨论摘要"'))
  assert.ok(raw < source.indexOf("<IdeaContent"))
  assert.ok(raw < source.indexOf('id="document-edit"'))
  assert.match(source, /savedIdea\.source/)
  assert.match(source, /savedIdea\.capturedAt/)
})

test("discussion resume includes summarized discussed items without archived records", () => {
  const source = readFileSync("app/admin/page.tsx", "utf8")
  const query = source.slice(source.indexOf("prisma.idea.findMany", source.indexOf("prisma.idea.findMany") + 1), source.indexOf("return ("))
  assert.match(query, /ownerId: userId/)
  assert.match(query, /discussionStatus: "WANT_DISCUSS"/)
  assert.match(query, /discussionStatus: "DISCUSSED", discussionSummary: \{ not: "" \}/)
  assert.doesNotMatch(query, /ARCHIVED|STORED/)
  assert.match(query, /updatedAt: "desc"/)
})
