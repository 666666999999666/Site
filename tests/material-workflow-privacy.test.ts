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
