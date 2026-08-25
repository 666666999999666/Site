import assert from "node:assert/strict"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Compose is explicit, release-aware, and rotates every service log", () => {
  const common = read("ops/common.sh")
  const compose = read("docker-compose.yml")

  assert.match(common, /--env-file "\$APP_DIR\/\.env"[\s\S]*?--file "\$APP_DIR\/docker-compose\.yml"/)
  assert.match(compose, /APP_RELEASE_SHA: \$\{APP_RELEASE_SHA:\?APP_RELEASE_SHA is required\}/)
  assert.doesNotMatch(compose, /pull_policy:\s*always/)
  assert.equal((compose.match(/driver: json-file/g) ?? []).length, 3)
  assert.equal((compose.match(/max-size: 10m/g) ?? []).length, 3)
  assert.equal((compose.match(/max-file: "3"/g) ?? []).length, 3)
})

test("maintenance status is read-only and mutations use separate actions", () => {
  const maintenance = read("ops/maintenance.sh")
  const statusCase = maintenance.match(/status\)([\s\S]*?);;/)?.[1] ?? ""

  assert.match(statusCase, /compose ps/)
  assert.match(statusCase, /verify-release\.sh/)
  assert.doesNotMatch(statusCase, /smoke-test|run_mcp_maintenance|cleanup|backup/)
  assert.match(maintenance, /storage-cleanup\)[\s\S]*?storage-cleanup\.sh[\s\S]*?prune-images\.sh/)
})

test("unified storage cleanup is a no-op without candidates and backs up exactly once otherwise", () => {
  const cleanup = read("ops/storage-cleanup.sh")
  const noCandidate = cleanup.indexOf("No storage cleanup candidates; no backup was created")
  const completeBackup = cleanup.indexOf('backup.sh" storage-cleanup')

  assert.ok(noCandidate >= 0)
  assert.ok(completeBackup > noCandidate)
  assert.equal((cleanup.match(/backup\.sh" storage-cleanup/g) ?? []).length, 1)
  assert.match(cleanup, /public_count \+ private_count \+ expired_tickets/)
  assert.match(cleanup, /QZSITE_STORAGE_BACKUP_READY="\$backup_set"/)
  assert.ok(cleanup.indexOf('cleanup-uploads.sh" --apply') < cleanup.indexOf('cleanup-study-uploads.sh" --apply'))

  for (const wrapper of [read("ops/cleanup-uploads.sh"), read("ops/cleanup-study-uploads.sh")]) {
    assert.match(wrapper, /Z-storage-cleanup\$/)
    assert.match(wrapper, /-uploads\.tar\.gz/)
    assert.match(wrapper, /-study-uploads\.tar\.gz/)
    assert.match(wrapper, /\.sha256/)
  }
})

test(
  "unified storage cleanup executes the no-op and single-backup contracts",
  { skip: process.platform === "win32" ? "requires a POSIX shell" : false },
  () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "qzsite-storage-cleanup-"))
    const fixtureOps = path.join(fixture, "ops")
    const backupDir = path.join(fixture, "backups")
    const calls = path.join(fixture, "calls")
    const cleanupScript = path.resolve("ops/storage-cleanup.sh")
    const common = path.join(fixture, "common.sh")

    try {
      mkdirSync(fixtureOps, { recursive: true })
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(
        common,
        [
          `APP_DIR=${JSON.stringify(fixture)}`,
          `BACKUP_DIR=${JSON.stringify(backupDir)}`,
          "mkdir -p \"$BACKUP_DIR\"",
          "log() { :; }",
          "fail() { printf '%s\\n' \"$*\" >&2; exit 1; }",
          "require_file() { [[ -f \"$1\" ]] || fail \"missing: $1\"; }",
        ].join("\n")
      )
      writeFileSync(
        path.join(fixtureOps, "cleanup-uploads.sh"),
        [
          "#!/usr/bin/env bash",
          "if [[ \"$1\" == \"--dry-run\" ]]; then",
          "  printf 'orphanUploads=%s orphanUploadBytes=%s\\n' \"${PUBLIC_COUNT:-0}\" \"${PUBLIC_BYTES:-0}\"",
          "else",
          `  printf 'public:%s\\n' \"$QZSITE_STORAGE_BACKUP_READY\" >> ${JSON.stringify(calls)}`,
          "fi",
        ].join("\n")
      )
      writeFileSync(
        path.join(fixtureOps, "cleanup-study-uploads.sh"),
        [
          "#!/usr/bin/env bash",
          "if [[ \"$1\" == \"--dry-run\" ]]; then",
          "  printf 'expiredReviewTickets=%s repairCandidates=%s dueImageRows=%s oldFilesWithoutRow=%s\\n' \"${TICKET_COUNT:-0}\" \"${REPAIR_COUNT:-0}\" \"${DUE_COUNT:-0}\" \"${ORPHAN_STUDY_COUNT:-0}\"",
          "else",
          `  printf 'study:%s\\n' \"$QZSITE_STORAGE_BACKUP_READY\" >> ${JSON.stringify(calls)}`,
          "fi",
        ].join("\n")
      )
      writeFileSync(
        path.join(fixtureOps, "backup.sh"),
        [
          "#!/usr/bin/env bash",
          "set -e",
          "base=qzsite-20260825T030000Z-storage-cleanup",
          `printf 'backup\\n' >> ${JSON.stringify(calls)}`,
          `touch ${JSON.stringify(backupDir)}/\"$base\".dump`,
          `touch ${JSON.stringify(backupDir)}/\"$base\"-uploads.tar.gz`,
          `touch ${JSON.stringify(backupDir)}/\"$base\"-study-uploads.tar.gz`,
          `touch ${JSON.stringify(backupDir)}/\"$base\".sha256`,
          "printf 'BACKUP_SET=%s\\n' \"$base\"",
        ].join("\n")
      )
      for (const filename of [
        common,
        path.join(fixtureOps, "cleanup-uploads.sh"),
        path.join(fixtureOps, "cleanup-study-uploads.sh"),
        path.join(fixtureOps, "backup.sh"),
      ]) {
        chmodSync(filename, 0o700)
      }

      const run = (extraEnv: Record<string, string> = {}) =>
        spawnSync("bash", [cleanupScript], {
          encoding: "utf8",
          env: {
            ...process.env,
            QZSITE_OPS_COMMON: common,
            ...extraEnv,
          },
        })

      const noOp = run()
      assert.equal(noOp.status, 0, noOp.stderr)
      assert.equal(existsSync(calls), false)

      const applied = run({
        PUBLIC_COUNT: "2",
        PUBLIC_BYTES: "460727",
        TICKET_COUNT: "1",
        REPAIR_COUNT: "1",
      })
      assert.equal(applied.status, 0, applied.stderr)
      assert.deepEqual(readFileSync(calls, "utf8").trim().split("\n"), [
        "backup",
        "public:qzsite-20260825T030000Z-storage-cleanup",
        "study:qzsite-20260825T030000Z-storage-cleanup",
      ])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }
)

test("upload cleanup uses serial database reads and refuses unsafe names", () => {
  const common = read("ops/common.sh")
  const publicWrapper = read("ops/cleanup-uploads.sh")
  const privateWrapper = read("ops/cleanup-study-uploads.sh")
  const cleanup = read("scripts/cleanup-uploads.ts")

  assert.match(common, /require_safe_data_subdirectory\(\)/)
  assert.match(common, /target_root" == "\$data_root\/\$name"/)
  assert.match(publicWrapper, /require_safe_data_subdirectory uploads/)
  assert.match(privateWrapper, /require_safe_data_subdirectory study-uploads/)
  assert.doesNotMatch(cleanup, /Promise\.all\(\[\s*client\.query/)
  assert.match(cleanup, /const SAFE_UPLOAD_NAME = \/\^\[A-Za-z0-9\]/)
  assert.match(cleanup, /Refusing to inspect an unsafe upload filename/)
  assert.match(cleanup, /orphanUploads=\$\{orphaned\.length\} orphanUploadBytes=\$\{orphanBytes\}/)
})

test(
  "data directory guards reject symlinked upload roots before cleanup",
  { skip: process.platform === "win32" ? "requires POSIX symlink semantics" : false },
  () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "qzsite-data-guard-"))
    const ops = path.join(fixture, "ops")
    const data = path.join(fixture, "data")
    const outside = path.join(fixture, "outside")
    try {
      mkdirSync(ops)
      mkdirSync(path.join(data, "uploads"), { recursive: true })
      mkdirSync(outside)
      writeFileSync(path.join(fixture, ".env"), "DB_PASSWORD=test\n")
      const common = path.join(ops, "common.sh")
      writeFileSync(common, read("ops/common.sh"))
      const safe = spawnSync("bash", ["-c", `source ${JSON.stringify(common)}; require_safe_data_subdirectory uploads`], { encoding: "utf8" })
      assert.equal(safe.status, 0, safe.stderr)

      rmSync(path.join(data, "uploads"), { recursive: true })
      symlinkSync(outside, path.join(data, "uploads"), "dir")
      const unsafe = spawnSync("bash", ["-c", `source ${JSON.stringify(common)}; require_safe_data_subdirectory uploads`], { encoding: "utf8" })
      assert.notEqual(unsafe.status, 0)
      assert.match(unsafe.stderr, /must be a real directory/)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }
)

test("new backups exclude MCP staging and retention only removes complete sets", () => {
  const backup = read("ops/backup.sh")
  const verify = read("ops/verify-backup.sh")

  assert.match(backup, /--exclude='uploads\/\.mcp-staging'/)
  assert.match(backup, /--exclude='uploads\/\.mcp-staging\/\*\*'/)
  assert.match(backup, /backup_set_complete "\$candidate"[\s\S]*?Refusing to split an incomplete backup set/)
  assert.match(backup, /prune_group_to_count predeploy 5/)
  assert.match(backup, /prune_group_to_count cleanup 3/)
  assert.match(backup, /prune_group_to_count migration 3/)
  assert.match(backup, /quota_bytes=\$\(\(1024 \* 1024 \* 1024\)\)/)
  assert.match(backup, /protected_backup_set/)
  assert.match(verify, /\.last-verified-backup/)
  assert.match(verify, /Recorded latest verified backup set/)
  assert.match(verify, /Historical MCP staging entry is not a directory/)
})

test("Cron installs the requested lifecycle and rotates its own log", () => {
  const cron = read("ops/install-maintenance-cron.sh")
  const runner = read("ops/run-maintenance-cron.sh")
  const rotation = read("ops/rotate-maintenance-log.sh")

  for (const entry of [
    "0 3 * * *",
    "20 3 * * *",
    "30 3 * * 0",
    "15 * * * *",
    "10 2,14 * * *",
    "* * * * *",
  ]) {
    assert.ok(cron.includes(entry), `${entry} must be installed`)
  }
  assert.match(cron, /storage-cleanup/)
  assert.match(cron, /deploy-watchdog/)
  assert.match(runner, /rotate-maintenance-log\.sh/)
  assert.match(rotation, /10 \* 1024 \* 1024/)
  assert.match(rotation, /\$log_file\.5\.gz/)
  assert.match(rotation, /gzip --stdout/)
})

test("ACME keeps the manual installer and adds an immutable, rollback-safe path", () => {
  const configure = read("ops/configure-acme.sh")
  const renew = read("ops/acme-renew.sh")
  const manual = read("ops/install-tls.sh")

  assert.match(configure, /certbot\/certbot@sha256:\[0-9a-f\]\{64\}/)
  assert.match(
    configure,
    /certbot\/certbot@sha256:d07bd043d61d6bee1114235ac12c2e9a5c54b6931b3ccf5e1174d6c8c4afaa95/
  )
  assert.match(configure, /\.acme-config/)
  assert.match(renew, /--standalone/)
  assert.match(renew, /--domain liaoqizai\.site/)
  assert.match(renew, /--domain www\.liaoqizai\.site/)
  assert.match(renew, /restoring the previous certificate/)
  assert.match(renew, /compose start nginx/)
  assert.match(manual, /TLS_CERT_B64/)
  assert.match(manual, /TLS_KEY_B64/)
})

test("automatic image cleanup trusts only three confirmed local stable versions", () => {
  const images = read("ops/prune-images.sh")

  assert.match(images, /\.deploy-history/)
  assert.match(images, /\^\[0-9a-f\]\{40\}\$/)
  assert.match(images, /stable_image_ids\[@\].*>= 3/)
  assert.match(images, /7 \* 24 \* 60 \* 60/)
  assert.match(images, /referenced_image_ids/)
  assert.doesNotMatch(images, /docker (system|image) prune/)
})

test("host log governance has bounded journald and an exact rollback path", () => {
  const install = read("ops/install-host-log-governance.sh")
  const rollback = read("ops/rollback-host-log-governance.sh")

  assert.match(install, /SystemMaxUse=512M/)
  assert.match(install, /SystemKeepFree=5G/)
  assert.match(install, /MaxRetentionSec=7day/)
  assert.match(install, /SystemMaxFileSize=64M/)
  assert.match(install, /StandardOutput=null/)
  assert.match(install, /StandardError=journal/)
  assert.match(install, /ROLLBACK_DIR=/)
  assert.match(rollback, /journal_target="\/etc\/systemd\/journald\.conf\.d\/qzsite\.conf"/)
  assert.match(rollback, /agent_target="\/etc\/systemd\/system\/gitee-go-agent\.service\.d\/qzsite-logging\.conf"/)
})
