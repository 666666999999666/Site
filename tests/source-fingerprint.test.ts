import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

const execFileAsync = promisify(execFile)
const fingerprintScript = path.resolve("scripts/source-fingerprint.mjs")

async function fingerprint(root: string, manifest?: string) {
  const args = [fingerprintScript, root]
  if (manifest) args.push(manifest)
  const { stdout } = await execFileAsync(process.execPath, args)
  return stdout.trim()
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

test("source fingerprint ignores persistent data but changes with source", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "qzsite-fingerprint-"))
  t.after(() => rm(root, { recursive: true, force: true }))

  await mkdir(path.join(root, "app"), { recursive: true })
  await mkdir(path.join(root, "data", "uploads"), { recursive: true })
  await mkdir(path.join(root, ".worktrees", "agent-product"), { recursive: true })
  await mkdir(path.join(root, ".next-questions-manual"), { recursive: true })
  await mkdir(path.join(root, "coverage"), { recursive: true })
  await mkdir(path.join(root, "playwright-report"), { recursive: true })
  await mkdir(path.join(root, "test-results"), { recursive: true })
  await mkdir(path.join(root, "ops"), { recursive: true })
  await mkdir(path.join(root, "nginx", "conf.d"), { recursive: true })
  await writeFile(path.join(root, "app", "page.tsx"), "export default function Page() {}\n")
  await writeFile(path.join(root, "docker-compose.yml"), "services: {}\n")
  await writeFile(path.join(root, "nginx", "conf.d", "default.conf"), "server {}\n")
  const initial = await fingerprint(root)

  await writeFile(path.join(root, "data", "uploads", "production.webp"), "mutable")
  await writeFile(path.join(root, ".worktrees", "agent-product", "runtime.py"), "local agent source")
  await writeFile(path.join(root, ".next-questions-manual", "BUILD_ID"), "generated build")
  await writeFile(path.join(root, ".deploy-state.temporary"), "runtime state")
  await writeFile(path.join(root, "ops", ".deploy-bootstrap-deploy.ABC123"), "staged deploy")
  await writeFile(path.join(root, "coverage", "lcov.info"), "generated coverage")
  await writeFile(path.join(root, "playwright-report", "index.html"), "generated report")
  await writeFile(path.join(root, "test-results", "results.json"), "generated results")
  assert.equal(await fingerprint(root), initial)

  const includedReadme = path.join(root, "README.md")
  await writeFile(includedReadme, "included release documentation\n")
  assert.notEqual(await fingerprint(root), initial)
  await unlink(includedReadme)
  assert.equal(await fingerprint(root), initial)

  const extraNginx = path.join(root, "nginx", "conf.d", "unexpected.conf")
  await writeFile(extraNginx, "server { listen 8443; }\n")
  assert.equal(await fingerprint(root), initial)
  await unlink(extraNginx)

  await writeFile(path.join(root, "nginx", "conf.d", "default.conf"), "server { listen 443; }\n")
  assert.notEqual(await fingerprint(root), initial)
  await writeFile(path.join(root, "nginx", "conf.d", "default.conf"), "server {}\n")

  await writeFile(path.join(root, "docker-compose.yml"), "services: { web: {} }\n")
  assert.notEqual(await fingerprint(root), initial)
  await writeFile(path.join(root, "docker-compose.yml"), "services: {}\n")

  await writeFile(path.join(root, "app", "page.tsx"), "export default function Page() { return null }\n")
  assert.notEqual(await fingerprint(root), initial)
})

test("release manifests ignore build artifacts but reject tracked source drift", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "qzsite-manifest-fingerprint-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, "app"), { recursive: true })
  const source = "export default function Page() {}\n"
  await writeFile(path.join(root, "app", "page.tsx"), source)
  const manifestPath = path.join(root, "source-manifest.json")
  await writeFile(manifestPath, JSON.stringify({
    schema_version: 1,
    release_sha: "0123456789abcdef0123456789abcdef01234567",
    files: [{ path: "app/page.tsx", kind: "file", sha256: sha256(source) }],
  }))

  const releaseSha = "0123456789abcdef0123456789abcdef01234567"
  const initial = await fingerprint(root, manifestPath)
  assert.equal(
    await fingerprint(root, manifestPath),
    initial,
    "the exact generated manifest attachment must not fingerprint itself"
  )
  await mkdir(path.join(root, "app", "extra"), { recursive: true })
  await writeFile(path.join(root, "app", "extra", "page.tsx"), "unexpected source\n")
  await assert.rejects(
    fingerprint(root, manifestPath),
    /Source tree contains a file outside the release manifest: app\/extra\/page\.tsx/
  )
  await rm(path.join(root, "app", "extra"), { recursive: true, force: true })

  const { stdout } = await execFileAsync(
    process.execPath,
    [fingerprintScript, root, manifestPath, releaseSha]
  )
  assert.equal(stdout.trim(), initial)
  await assert.rejects(
    execFileAsync(process.execPath, [
      fingerprintScript,
      root,
      manifestPath,
      "fedcba9876543210fedcba9876543210fedcba98",
    ]),
    /Source manifest release SHA does not match the expected release/
  )

  await writeFile(path.join(root, "app", "page.tsx"), "tampered\n")
  await assert.rejects(
    fingerprint(root, manifestPath),
    /Tracked source content does not match the release manifest/
  )
})
