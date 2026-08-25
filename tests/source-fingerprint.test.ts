import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

const execFileAsync = promisify(execFile)
const fingerprintScript = path.resolve("scripts/source-fingerprint.mjs")

async function fingerprint(root: string) {
  const { stdout } = await execFileAsync(process.execPath, [fingerprintScript, root])
  return stdout.trim()
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

  const extraNginx = path.join(root, "nginx", "conf.d", "unexpected.conf")
  await writeFile(extraNginx, "server { listen 8443; }\n")
  assert.notEqual(await fingerprint(root), initial)
  await unlink(extraNginx)

  await writeFile(path.join(root, "docker-compose.yml"), "services: { web: {} }\n")
  assert.notEqual(await fingerprint(root), initial)
  await writeFile(path.join(root, "docker-compose.yml"), "services: {}\n")

  await writeFile(path.join(root, "app", "page.tsx"), "export default function Page() { return null }\n")
  assert.notEqual(await fingerprint(root), initial)
})
