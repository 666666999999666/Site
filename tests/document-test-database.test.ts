import assert from "node:assert/strict"
import { test } from "node:test"
import { requireDocumentTestDatabaseUrl } from "./document-test-database"

test("document browser tests refuse production and non-isolated databases", () => {
  const valid = "postgresql://test@127.0.0.1:55432/qz_document_test?schema=document_test_browser"
  assert.equal(requireDocumentTestDatabaseUrl(valid), valid)
  for (const invalid of [
    undefined, "postgresql://test@127.0.0.1/blog?schema=public",
    "postgresql://test@db.liaoqizai.site/document_test?schema=document_test_browser",
    "postgresql://test@127.0.0.1/document_test?schema=public",
    "postgresql://test@127.0.0.1/production_test?schema=document_test_browser",
  ]) assert.throws(() => requireDocumentTestDatabaseUrl(invalid))
})
