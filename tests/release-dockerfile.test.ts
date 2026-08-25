import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const renderer = path.resolve("scripts/render-release-dockerfile.mjs")

test("release Dockerfile pins the validated Git SHA without changing the source template", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "qzsite-release-dockerfile-"))
  const repository = path.join(directory, "repository")
  const output = path.join(directory, "Dockerfile.release")
  const manifestOutput = path.join(directory, "source-manifest.json")

  try {
    mkdirSync(path.join(repository, "scripts"), { recursive: true })
    copyFileSync("Dockerfile", path.join(repository, "Dockerfile"))
    copyFileSync(
      "scripts/source-fingerprint.mjs",
      path.join(repository, "scripts", "source-fingerprint.mjs")
    )
    execFileSync("git", ["init", repository], { stdio: "pipe" })
    execFileSync("git", ["-C", repository, "config", "user.name", "QZ Site Test"])
    execFileSync("git", ["-C", repository, "config", "user.email", "test@example.invalid"])
    execFileSync("git", ["-C", repository, "config", "core.autocrlf", "false"])
    execFileSync("git", ["-C", repository, "add", "Dockerfile", "scripts/source-fingerprint.mjs"])
    execFileSync("git", ["-C", repository, "commit", "-m", "release fixture"], { stdio: "pipe" })
    const sha = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim()
    const before = readFileSync(path.join(repository, "Dockerfile"), "utf8")

    execFileSync(
      process.execPath,
      [renderer, sha, output, manifestOutput],
      { cwd: repository }
    )
    const rendered = readFileSync(output, "utf8")
    const manifest = JSON.parse(readFileSync(manifestOutput, "utf8")) as {
      schema_version: number
      release_sha: string
      files: Array<{ path: string; kind: string; sha256: string }>
    }

    assert.match(rendered, new RegExp(`ARG APP_RELEASE_SHA=${sha}`))
    assert.match(rendered, /LABEL org\.opencontainers\.image\.revision=\$APP_RELEASE_SHA/)
    assert.match(rendered, /RUN apk add --no-cache bash git postgresql16 postgresql16-client su-exec/)
    assert.match(rendered, /RUN bash scripts\/run-build-db-gate\.sh/)
    assert.match(rendered, /source-fingerprint\.mjs \/app \/app\/source-manifest\.json/)
    assert.match(rendered, /COPY --from=builder \/app\/source-manifest\.json \.\/\.source-manifest\.json/)
    assert.match(rendered, /manifest\.release_sha !== process\.env\.APP_RELEASE_SHA/)
    assert.match(rendered, /chmod 0444 \/app\/\.source-fingerprint \/app\/\.source-manifest\.json/)
    assert.match(rendered, /NEXT_PHASE=phase-production-build npm run build/)
    assert.doesNotMatch(rendered, /ENV NEXT_PHASE=/)
    assert.equal(manifest.schema_version, 1)
    assert.equal(manifest.release_sha, sha)
    assert.ok(manifest.files.some((entry) => entry.path === "Dockerfile"))
    assert.ok(manifest.files.some((entry) => entry.path === "scripts/source-fingerprint.mjs"))
    assert.ok(manifest.files.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)))
    assert.equal(readFileSync(path.join(repository, "Dockerfile"), "utf8"), before)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("release Dockerfile rejects abbreviated or non-hex revisions", () => {
  const result = spawnSync(
    process.execPath,
    [renderer, "abc123"],
    { encoding: "utf8" }
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /release SHA must be a full 40-character lowercase Git commit/)
})
