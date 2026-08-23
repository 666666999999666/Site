import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
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
  await mkdir(path.join(root, "ops"), { recursive: true })
  await writeFile(path.join(root, "app", "page.tsx"), "export default function Page() {}\n")
  const initial = await fingerprint(root)

  await writeFile(path.join(root, "data", "uploads", "production.webp"), "mutable")
  await writeFile(path.join(root, ".deploy-state.temporary"), "runtime state")
  await writeFile(path.join(root, "ops", ".deploy-bootstrap-deploy.ABC123"), "staged deploy")
  assert.equal(await fingerprint(root), initial)

  await writeFile(path.join(root, "app", "page.tsx"), "export default function Page() { return null }\n")
  assert.notEqual(await fingerprint(root), initial)
})
