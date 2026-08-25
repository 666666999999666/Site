import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const sha = "0123456789abcdef0123456789abcdef01234567"

test("release Dockerfile pins the validated Git SHA without changing the source template", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "qzsite-release-dockerfile-"))
  const output = path.join(directory, "Dockerfile.release")
  const before = readFileSync("Dockerfile", "utf8")

  try {
    execFileSync(process.execPath, ["scripts/render-release-dockerfile.mjs", sha, output])
    const rendered = readFileSync(output, "utf8")

    assert.match(rendered, new RegExp(`ARG APP_RELEASE_SHA=${sha}`))
    assert.match(rendered, /LABEL org\.opencontainers\.image\.revision=\$APP_RELEASE_SHA/)
    assert.match(rendered, /RUN apk add --no-cache bash git postgresql16 postgresql16-client su-exec/)
    assert.match(rendered, /RUN bash scripts\/run-build-db-gate\.sh/)
    assert.match(rendered, /NEXT_PHASE=phase-production-build npm run build/)
    assert.doesNotMatch(rendered, /ENV NEXT_PHASE=/)
    assert.equal(readFileSync("Dockerfile", "utf8"), before)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("release Dockerfile rejects abbreviated or non-hex revisions", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/render-release-dockerfile.mjs", "abc123"],
    { encoding: "utf8" }
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /release SHA must be a full 40-character lowercase Git commit/)
})
