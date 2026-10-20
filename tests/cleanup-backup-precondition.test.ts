import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const backupSet = "qzsite-20261020T010203Z-storage-cleanup"
const suffixes = [".dump", "-uploads.tar.gz", "-study-uploads.tar.gz", ".sha256"]

for (const resource of ["uploads", "study-uploads"]) {
  test(`${resource} cleanup fails closed and preserves shared, standalone and dry-run backup behavior`, { skip: process.platform === "win32" }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "cleanup-precondition-"))
    const ops = path.join(root, "ops")
    const backups = path.join(root, "backups")
    const calls = path.join(root, "calls")
    try {
      mkdirSync(ops)
      mkdirSync(backups)
      mkdirSync(path.join(root, "data", resource), { recursive: true })
      writeFileSync(path.join(root, ".env"), "")
      // Run the real common guard and real wrapper. Only external effects are stubs.
      writeFileSync(path.join(ops, "common.sh"), readFileSync("ops/common.sh", "utf8") + `\ncompose() { printf 'cleanup %s\\n' "$*" >> ${JSON.stringify(calls)}; }\n`)
      writeFileSync(path.join(ops, `cleanup-${resource}.sh`), readFileSync(`ops/cleanup-${resource}.sh`, "utf8"))
      writeFileSync(path.join(ops, "backup.sh"), `printf 'backup %s\\n' "$*" >> ${JSON.stringify(calls)}\n`)
      function run(mode: string, shared: string) {
        rmSync(calls, { force: true })
        const env: NodeJS.ProcessEnv = { ...process.env, BACKUP_DIR: backups, QZSITE_STORAGE_BACKUP_READY: shared }
        delete env.QZSITE_APP_DIR_OVERRIDE
        return spawnSync("bash", [path.join(ops, `cleanup-${resource}.sh`), mode], { env, encoding: "utf8" })
      }
      const recorded = () => existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : []
      for (const invalid of ["../escape", "qzsite-20261020T010203Z-upload-cleanup", `${backupSet}/child`]) {
        const result = run("--apply", invalid)
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /backup identifier is invalid/)
        assert.deepEqual(recorded(), [])
      }
      for (const suffix of suffixes) writeFileSync(path.join(backups, backupSet + suffix), "fixture")
      for (const suffix of suffixes) {
        rmSync(path.join(backups, backupSet + suffix))
        const result = run("--apply", backupSet)
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /Required file is missing/)
        assert.deepEqual(recorded(), [], `cleanup cannot run without ${suffix}`)
        writeFileSync(path.join(backups, backupSet + suffix), "fixture")
      }
      assert.equal(run("--apply", backupSet).status, 0)
      assert.equal(recorded().length, 1)
      assert.match(recorded()[0], /^cleanup /)
      assert.match(recorded()[0], /_CLEANUP_CONFIRMED=1/)
      assert.match(recorded()[0], /--apply$/)
      assert.equal(run("--apply", "").status, 0)
      assert.equal(recorded().length, 2)
      assert.equal(recorded()[0], resource === "uploads" ? "backup upload-cleanup" : "backup study-upload-cleanup")
      assert.match(recorded()[1], /^cleanup /)
      assert.equal(run("--dry-run", "invalid-but-unused").status, 0)
      assert.equal(recorded().length, 1)
      assert.match(recorded()[0], /^cleanup /)
      assert.doesNotMatch(recorded()[0], /CONFIRMED|--apply/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
