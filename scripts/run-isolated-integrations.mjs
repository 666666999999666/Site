import { spawnSync } from "node:child_process"

const suites = [
  ["daily", "DAILY_INTEGRATION_TEST_DATABASE_URL", "daily-integration.ts"],
  ["questions", "QUESTION_TEST_DATABASE_URL", "questions-integration.ts"],
  ["inbox", "INBOX_TEST_DATABASE_URL", "inbox-integration.ts"],
  ["blog", "BLOG_SERIES_TEST_DATABASE_URL", "blog-series-integration.ts"],
  ["gateway", "MCP_GATEWAY_TEST_DATABASE_URL", "mcp-gateway-smoke.ts"],
  ["oauth", "MCP_OAUTH_TEST_DATABASE_URL", "mcp-oauth-integration.ts"],
  ["domain", "SERVER_DOMAIN_TEST_DATABASE_URL", "server-domain-integration.ts"],
]
const selected = process.argv.slice(2)
if (selected.some((name) => !suites.some(([suite]) => suite === name))) {
  throw new Error("Unknown suite; choose daily, questions, inbox, blog, gateway, oauth, domain")
}
const results = []
for (const [name, variable, entrypoint] of suites) {
  if (selected.length && !selected.includes(name)) continue
  const value = process.env[variable]
  if (!value) throw new Error(`${variable} is required; use with-isolated-postgres.sh`)
  const url = new URL(value)
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      !url.port || url.pathname !== `/site_test_${name}` ||
      url.username !== "site_test_admin" || url.password || url.hash ||
      [...url.searchParams.keys()].some((key) => key !== "schema") ||
      [...url.searchParams.keys()].length > 1) {
    throw new Error(`Refusing an unexpected ${name} integration destination`)
  }
  const env = { ...process.env, DATABASE_URL: value, NODE_ENV: "test" }
  const run = (args) => spawnSync(process.execPath, args, { env, stdio: "inherit" })
  console.log(`\n=== Isolated ${name} integration ===`)
  // OAuth verifies historical upgrades itself, including all current migrations.
  const migrate = name === "oauth" ? { status: 0 } :
    run(["node_modules/prisma/build/index.js", "migrate", "deploy"])
  const result = migrate.status === 0 ?
    run(["--import", "tsx", `tests/${entrypoint}`]) : migrate
  results.push({ suite: name, passed: result.status === 0 })
}
console.log("\nIsolated integration results:", JSON.stringify(results))
if (results.some((result) => !result.passed)) process.exitCode = 1
