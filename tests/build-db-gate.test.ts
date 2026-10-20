import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"
import { requireInboxTestDatabaseUrl } from "./inbox-test-database"
import { requireMcpOAuthTestDatabaseUrl } from "./mcp-oauth-test-database"

test("the release image build runs the complete PostgreSQL 16 integration gate", () => {
  const gate = readFileSync("scripts/run-build-db-gate.sh", "utf8")

  assert.match(gate, /The build database gate requires PostgreSQL 16/)
  assert.match(gate, /-h 127\.0\.0\.1/)
  assert.match(gate, /schema=blog_series_test_build/)
  assert.match(gate, /schema=question_test_build/)
  assert.doesNotMatch(gate, /BLOG_SERIES_TEST_DATABASE_URL="\$database_url"/)
  assert.doesNotMatch(gate, /QUESTION_TEST_DATABASE_URL="\$database_url"/)
  assert.match(gate, /NODE_PATH=\/prisma\/node_modules/)
  assert.match(gate, /node \/prisma\/node_modules\/prisma\/build\/index\.js migrate deploy/)
  assert.match(gate, /run_runtime_prisma_migration[\s\S]*?run_runtime_prisma_migration/)
  assert.match(gate, /test:blog-series:integration/)
  assert.match(gate, /test:questions:integration/)
  assert.match(gate, /test:inbox:integration/)
  assert.match(gate, /test:mcp:oauth/)
  assert.match(gate, /trap cleanup EXIT/)
  assert.match(gate, /trap 'exit 143' TERM/)
  assert.match(gate, /chown postgres:postgres "\$gate_root"/)
  assert.match(gate, /rm -rf -- "\$gate_root"/)
  assert.doesNotMatch(gate, /0\.0\.0\.0|POSTGRES_HOST_AUTH_METHOD/)
})

test("build gate database destinations satisfy the actual integration safety guards", () => {
  const gate = readFileSync("scripts/run-build-db-gate.sh", "utf8")
  // Evaluate only URL declarations/exports, never the PostgreSQL setup or tests.
  const declarations = gate.split("\n").filter((line) =>
    /^(pg_port|database_name|postgres_url|database_url|blog_series_database_url|question_database_url)=/.test(line)
    || /^export (DATABASE_URL|MCP_OAUTH_TEST_DATABASE_URL)=/.test(line)
  )
  const output = execFileSync("bash", ["-eu", "-c", [
    ...declarations,
    'printf "%s\\n%s\\n" "$DATABASE_URL" "$MCP_OAUTH_TEST_DATABASE_URL"',
  ].join("\n")], { encoding: "utf8" })
  const [inboxUrl, oauthUrl] = output.trim().split("\n")
  assert.equal(requireInboxTestDatabaseUrl(inboxUrl), inboxUrl)
  assert.equal(requireMcpOAuthTestDatabaseUrl(oauthUrl), oauthUrl)
  assert.equal(new URL(oauthUrl).search, "")
})
