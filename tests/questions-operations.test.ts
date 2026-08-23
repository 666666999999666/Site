import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const projectRoot = path.resolve(import.meta.dirname, "..")

function serverBlocks(source: string): string[] {
  const blocks: string[] = []
  const pattern = /\bserver\s*\{/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    let depth = 1
    let cursor = pattern.lastIndex
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1
      if (source[cursor] === "}") depth -= 1
      cursor += 1
    }
    assert.equal(depth, 0, "Nginx server block must have balanced braces")
    blocks.push(source.slice(match.index, cursor))
    pattern.lastIndex = cursor
  }

  return blocks
}

test("Question maintenance reports and cancels every active expired review ticket", async () => {
  const source = await readFile(
    path.join(projectRoot, "scripts", "cleanup-study-uploads.ts"),
    "utf8"
  )
  const normalized = source.replace(/\s+/g, " ")

  assert.match(
    normalized,
    /SELECT COUNT\(\*\)::integer AS "count" FROM "QuestionReviewTicket" WHERE "expiresAt" <= NOW\(\) AND "cancelledAt" IS NULL AND "consumedAt" IS NULL/
  )
  assert.match(
    normalized,
    /UPDATE "QuestionReviewTicket" SET "cancelledAt" = NOW\(\), "answerDigest" = NULL, "updatedAt" = NOW\(\) WHERE "expiresAt" <= NOW\(\) AND "cancelledAt" IS NULL AND "consumedAt" IS NULL/
  )
  assert.match(source, /expiredReviewTickets=/)
  assert.match(source, /SELECT set_config\('search_path', \$1, false\)/)
})

test("every public Nginx server uses a query-free and referrer-free access log", async () => {
  const source = await readFile(
    path.join(projectRoot, "nginx", "conf.d", "default.conf"),
    "utf8"
  )
  const format = source.match(/log_format\s+privacy\s+([\s\S]*?);/)

  assert.ok(format, "privacy log_format must exist")
  assert.doesNotMatch(
    format[1],
    /\$(?:request(?:_uri)?|args|http_referer)\b/,
    "privacy log_format must not persist query strings or referrers"
  )
  assert.match(format[1], /\$uri/)
  assert.match(format[1], /\$status/)

  const publicServers = serverBlocks(source).filter(
    (block) => /\blisten\s+(?:80|443)\b/.test(block)
  )
  assert.equal(publicServers.length, 4)
  for (const block of publicServers) {
    assert.match(
      block,
      /\baccess_log\s+\/var\/log\/nginx\/access\.log\s+privacy;/,
      "public server must override the inherited combined log"
    )
  }
})

test("Question search terms are excluded from inherited Nginx error logs", async () => {
  const source = await readFile(
    path.join(projectRoot, "nginx", "conf.d", "default.conf"),
    "utf8"
  )
  const proxiedServers = serverBlocks(source).filter((block) =>
    /proxy_pass\s+http:\/\/web:3000;/.test(block)
  )

  assert.equal(proxiedServers.length, 2)
  for (const block of proxiedServers) {
    const questionLocation = block.match(
      /location\s*=\s*\/api\/questions\s*\{([\s\S]*?)\n\s*\}/
    )
    assert.ok(questionLocation, "proxied server must isolate the Question query endpoint")
    assert.match(questionLocation[1], /error_log\s+\/dev\/null\s+emerg;/)
    assert.match(questionLocation[1], /proxy_pass\s+http:\/\/web:3000;/)
  }
})

test("every public Nginx server hides the loopback-only Question smoke endpoint", async () => {
  const source = await readFile(
    path.join(projectRoot, "nginx", "conf.d", "default.conf"),
    "utf8"
  )
  const publicServers = serverBlocks(source).filter(
    (block) => /\blisten\s+(?:80|443)\b/.test(block)
  )

  assert.equal(publicServers.length, 4)
  for (const block of publicServers) {
    const internalLocation = block.match(
      /location\s*=\s*\/api\/internal\/question-smoke\s*\{([\s\S]*?)\n\s*\}/
    )
    assert.ok(internalLocation, "public server must define the exact internal smoke path")
    assert.match(internalLocation[1], /\breturn\s+404;/)
    assert.doesNotMatch(internalLocation[1], /proxy_pass|return\s+301/)
  }
})

test("deployment smoke invokes Question writes only through the Web loopback", async () => {
  const source = await readFile(path.join(projectRoot, "ops", "smoke-test.sh"), "utf8")
  const block = source.match(
    /question_smoke_result=""([\s\S]*?)log "Public and loopback-only Question smoke tests passed"/
  )

  assert.ok(block, "Question smoke block must exist")
  assert.match(block[1], /compose exec --no-TTY web node -e/)
  assert.match(block[1], /http:\/\/127\.0\.0\.1:3000\/api\/internal\/question-smoke/)
  assert.match(block[1], /method: "POST"/)
  assert.match(block[1], /if \(!response\.ok\)/)
  assert.match(block[1], /response\.status/)
  assert.doesNotMatch(block[1], /\bcurl\b|\$site_url|response\.(?:text|json)\(/)
  assert.doesNotMatch(
    block[1],
    /console\.(?:log|error)\([^\n]*(?:responseBody|referenceAnswer|typedAnswer|answerMarkdown)/i
  )
  assert.match(source, /smoke_ca_file="\$\{SMOKE_CA_FILE:-\}"/)
  assert.match(source, /curl_args\+=\(--cacert "\$smoke_ca_file"\)/)
})

test("Docker build context excludes private and generated test artifacts", async () => {
  const source = await readFile(path.join(projectRoot, ".dockerignore"), "utf8")
  const entries = new Set(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  )

  for (const required of [
    ".next-*",
    "**/.next",
    "**/.next-*",
    "test-results",
    "playwright-report",
    "coverage",
  ]) {
    assert.ok(entries.has(required), `.dockerignore must exclude ${required}`)
  }

  for (const required of [
    "!README.md",
    "!docs/operations.md",
    "!docs/disaster-recovery.md",
    "!nginx/conf.d/default.conf",
    "!docker-compose.yml",
  ]) {
    assert.ok(entries.has(required), `.dockerignore must retain build-test input ${required}`)
  }
  assert.ok(entries.has("nginx/*"), ".dockerignore must keep Nginx certificates out")
})

test("Question Docker runtime fixture is local-only and disables automatic pulls", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests", "docker-question-runtime.override.yml"),
    "utf8"
  )

  assert.match(source, /pull_policy:\s*never/)
  assert.match(source, /127\.0\.0\.1:\$\{QZ_HTTP_PORT:-18080\}:80/)
  assert.match(source, /127\.0\.0\.1:\$\{QZ_HTTPS_PORT:-18443\}:443/)
  assert.doesNotMatch(source, /^\s*-\s*["']?(?:80|443):(?:80|443)/m)
})
