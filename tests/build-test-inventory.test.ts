import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import test from "node:test"

test("Docker runs the full unit inventory once, including the focused MCP protocol suite", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>
  const dockerfile = readFileSync("Dockerfile", "utf8")
  assert.equal(scripts.test, "tsx --test tests/*.test.ts")
  assert.equal(scripts["test:mcp"], "tsx --test tests/mcp-streamable-http.test.ts")
  assert.ok(readdirSync("tests").filter((name) => name.endsWith(".test.ts")).includes("mcp-streamable-http.test.ts"))
  assert.equal(dockerfile.split("\n").filter((line) => line === "RUN npm test").length, 1)
  assert.doesNotMatch(dockerfile, /^RUN npm run test:mcp$/m)
  assert.match(dockerfile, /^RUN bash scripts\/run-build-db-gate\.sh$/m)
})
