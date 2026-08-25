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
  const dockerfile = read("Dockerfile")

  assert.match(common, /--env-file "\$APP_DIR\/\.env"[\s\S]*?--file "\$APP_DIR\/docker-compose\.yml"/)
  assert.match(compose, /APP_RELEASE_SHA: \$\{APP_RELEASE_SHA:\?APP_RELEASE_SHA is required\}/)
  assert.doesNotMatch(compose, /pull_policy:\s*always/)
  assert.equal((compose.match(/driver: json-file/g) ?? []).length, 3)
  assert.equal((compose.match(/max-size: 10m/g) ?? []).length, 3)
  assert.equal((compose.match(/max-file: "3"/g) ?? []).length, 3)
  assert.match(dockerfile, /apk add --no-cache bash coreutils git/)
})

test("operation lock is bound to the application owner and shared by all mutating entrypoints", () => {
  const common = read("ops/common.sh")
  const scripts = [
    "ops/deploy.sh",
    "ops/deploy-watchdog.sh",
    "ops/maintenance.sh",
    "ops/configure-acme.sh",
    "ops/install-host-log-governance.sh",
    "ops/rollback-host-log-governance.sh",
  ].map(read)

  assert.match(common, /Operations must run as the application directory owner, without sudo bash/)
  assert.match(common, /prepare_owned_lock_file/)
  assert.match(common, /must be owned by the application owner with mode 600/)
  assert.match(common, /Application directory must not be group\/world-writable/)
  for (const script of scripts) {
    assert.match(script, /prepare_operation_lock|QZSITE_OPERATION_LOCK_HELD/)
    assert.doesNotMatch(script, /exec 9>"\/tmp\/qzsite-operation\.lock"/)
  }
})

test("maintenance status is read-only and mutations use separate actions", () => {
  const maintenance = read("ops/maintenance.sh")
  const pipeline = read(".workflow/pipeline-maintenance.yml")
  const statusCase = maintenance.match(/status\)([\s\S]*?);;/)?.[1] ?? ""

  assert.match(statusCase, /compose ps/)
  assert.match(statusCase, /verify-release\.sh/)
  assert.doesNotMatch(statusCase, /smoke-test|run_mcp_maintenance|cleanup|backup/)
  assert.match(maintenance, /storage-cleanup\)[\s\S]*?storage-cleanup\.sh[\s\S]*?prune-images\.sh/)
  assert.doesNotMatch(pipeline, /TLS_CERT_B64|TLS_KEY_B64/)
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
  assert.match(cron, /Unable to read the existing crontab safely/)
  assert.match(cron, /Existing crontab has malformed or duplicate QZ Site markers/)
  assert.match(cron, /restoring the previous crontab/)
  assert.match(cron, /CRITICAL: Cron rollback verification failed/)
  assert.match(cron, /cmp --silent "\$existing" "\$installed"/)
  assert.match(cron, /cmp --silent "\$launcher_backup" "\$launcher_path"/)
  assert.match(cron, /launcher_dir="\$cron_home\/\.local\/lib\/qzsite"/)
  assert.match(cron, /Deployment watchdog launcher directory resolved outside the cron home/)
  assert.match(cron, /Maintenance cron home must not be group\/world-writable/)
  assert.doesNotMatch(cron, /QZSITE_DEPLOY_WATCHDOG_LAUNCHER_PATH/)
  assert.match(cron, /Non-managed crontab entries changed during installation/)
  assert.doesNotMatch(cron, /crontab_command\[@\]}" -l[^\n]+\|\| true/)
  assert.match(runner, /rotate-maintenance-log\.sh/)
  assert.match(rotation, /10 \* 1024 \* 1024/)
  assert.match(rotation, /\$log_file\.5\.gz/)
  assert.match(rotation, /gzip --stdout/)
})

test(
  "Cron installation preserves external entries and rejects unsafe prior state",
  { skip: process.platform === "win32" ? "requires a POSIX crontab harness" : false },
  () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "qzsite-cron-install-"))
    const fixtureOps = path.join(fixture, "ops")
    const fakeBin = path.join(fixture, "bin")
    const state = path.join(fixture, "crontab.state")
    const launcher = path.join(fixture, ".local", "lib", "qzsite", "deploy-watchdog-launcher.sh")
    const installer = path.join(fixtureOps, "install-maintenance-cron.sh")

    try {
      mkdirSync(fixtureOps, { recursive: true })
      mkdirSync(fakeBin, { recursive: true })
      writeFileSync(
        path.join(fixtureOps, "common.sh"),
        [
          "set -Eeuo pipefail",
          "umask 077",
          `APP_DIR=${JSON.stringify(fixture)}`,
          `BACKUP_DIR=${JSON.stringify(path.join(fixture, "backups"))}`,
          "log() { printf '%s\\n' \"$*\"; }",
          "fail() { printf '%s\\n' \"$*\" >&2; exit 1; }",
        ].join("\n")
      )
      writeFileSync(installer, read("ops/install-maintenance-cron.sh"))
      writeFileSync(
        path.join(fixtureOps, "deploy-watchdog-launcher.sh"),
        "#!/usr/bin/env bash\nprintf 'new-launcher\\n'\n"
      )
      const fakeCrontab = path.join(fakeBin, "crontab")
      const fakeGetent = path.join(fakeBin, "getent")
      writeFileSync(
        fakeCrontab,
        [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          "if [[ \"${CRON_LIST_FAILURE:-0}\" == 1 && \"${*: -1}\" == -l ]]; then",
          "  printf 'backend unavailable\\n' >&2",
          "  exit 2",
          "fi",
          "if [[ \"${1:-}\" == -u ]]; then shift 2; fi",
          "case \"${1:-}\" in",
          "  -l)",
          "    if [[ -f \"$CRON_STATE\" ]]; then cat \"$CRON_STATE\"; else printf 'no crontab for root\\n' >&2; exit 1; fi",
          "    ;;",
          "  -r) rm -f -- \"$CRON_STATE\" ;;",
          "  '') exit 2 ;;",
          "  *)",
          "    cp -- \"$1\" \"$CRON_STATE\"",
          "    if [[ \"${CRON_WRITE_FAILURE:-0}\" == 1 && ! -e \"$CRON_FAILURE_MARKER\" ]]; then",
          "      : > \"$CRON_FAILURE_MARKER\"",
          "      exit 3",
          "    fi",
          "    ;;",
          "esac",
        ].join("\n")
      )
      writeFileSync(
        fakeGetent,
        [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          "[[ \"${1:-}\" == passwd && \"${2:-}\" == root ]] || exit 2",
          "printf 'root:x:0:0:root:%s:/bin/bash\\n' \"$CRON_TEST_HOME\"",
        ].join("\n")
      )
      chmodSync(installer, 0o700)
      chmodSync(fakeCrontab, 0o700)
      chmodSync(fakeGetent, 0o700)
      chmodSync(path.join(fixtureOps, "deploy-watchdog-launcher.sh"), 0o700)
      mkdirSync(path.dirname(launcher), { recursive: true })
      chmodSync(path.join(fixture, ".local"), 0o700)
      chmodSync(path.join(fixture, ".local", "lib"), 0o755)
      chmodSync(path.dirname(launcher), 0o700)

      const run = (extraEnv: Partial<NodeJS.ProcessEnv> = {}) => spawnSync("bash", [installer], {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          ...extraEnv,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
          CRON_STATE: state,
          CRON_TEST_HOME: fixture,
          MAINTENANCE_CRON_USER: "root",
        },
      })

      const external = "MAILTO=owner@example.invalid\n5 4 * * * /usr/local/bin/external-job\n"
      writeFileSync(
        state,
        `${external}# BEGIN QZSITE MANAGED\nold\n# END QZSITE MANAGED\n`
      )
      writeFileSync(launcher, "old-launcher\n")
      const success = run()
      assert.equal(success.status, 0, success.stderr)
      const installedState = readFileSync(state, "utf8")
      assert.ok(installedState.startsWith(external))
      assert.equal((installedState.match(/# BEGIN QZSITE MANAGED/g) ?? []).length, 1)
      assert.match(installedState, /ops\/run-maintenance-cron\.sh acme/)

      const malformed = `${external}# BEGIN QZSITE MANAGED\nunclosed\n`
      writeFileSync(state, malformed)
      writeFileSync(launcher, "stable-launcher\n")
      const rejected = run()
      assert.notEqual(rejected.status, 0)
      assert.equal(readFileSync(state, "utf8"), malformed)
      assert.equal(readFileSync(launcher, "utf8"), "stable-launcher\n")

      const beforeReadFailure = readFileSync(state, "utf8")
      const readFailure = run({ CRON_LIST_FAILURE: "1" })
      assert.notEqual(readFailure.status, 0)
      assert.equal(readFileSync(state, "utf8"), beforeReadFailure)
      assert.equal(readFileSync(launcher, "utf8"), "stable-launcher\n")

      const beforeWriteFailure = `${external}# BEGIN QZSITE MANAGED\nstable\n# END QZSITE MANAGED\n`
      const writeFailureMarker = path.join(fixture, "write-failed-once")
      writeFileSync(state, beforeWriteFailure)
      writeFileSync(launcher, "stable-launcher\n")
      const writeFailure = run({
        CRON_WRITE_FAILURE: "1",
        CRON_FAILURE_MARKER: writeFailureMarker,
      })
      assert.notEqual(writeFailure.status, 0)
      assert.equal(readFileSync(state, "utf8"), beforeWriteFailure)
      assert.equal(readFileSync(launcher, "utf8"), "stable-launcher\n")
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  }
)

test("ACME keeps the manual installer and adds an immutable, rollback-safe path", () => {
  const configure = read("ops/configure-acme.sh")
  const renew = read("ops/acme-renew.sh")
  const manual = read("ops/install-tls.sh")
  const check = read("ops/check-ssl.sh")

  assert.match(configure, /certbot\/certbot@sha256:\[0-9a-f\]\{64\}/)
  assert.match(
    configure,
    /certbot\/certbot@sha256:d07bd043d61d6bee1114235ac12c2e9a5c54b6931b3ccf5e1174d6c8c4afaa95/
  )
  assert.match(configure, /\.acme-config/)
  assert.ok(
    configure.indexOf("qzsite-operation.lock") < configure.indexOf(".acme-config.XXXXXX")
  )
  assert.match(configure, /config_installed/)
  assert.match(configure, /Existing ACME configuration must have mode 600/)
  assert.match(configure, /install -m 600 "\$previous_config" "\$config_path"/)
  assert.doesNotMatch(configure, /automatic renewal configured/)
  assert.match(configure, /install and verify maintenance cron separately/)
  assert.match(renew, /--standalone/)
  assert.match(renew, /prepare_owned_lock_file "\$ACME_LOCK_PATH" "ACME lock"/)
  assert.match(renew, /exec 6>>"\$ACME_LOCK_PATH"/)
  assert.doesNotMatch(renew, /exec 6>"\/tmp\/qzsite-acme\.lock"/)
  assert.match(renew, /installed_certificate_is_healthy/)
  assert.match(renew, /\[\[ -s "\$cert_path" && -s "\$key_path" \]\]/)
  assert.match(renew, /installed_cert_hash/)
  assert.match(renew, /installed_key_hash/)
  assert.match(renew, /compose exec --no-TTY nginx nginx -t/)
  assert.match(renew, /--domain liaoqizai\.site/)
  assert.match(renew, /--domain www\.liaoqizai\.site/)
  assert.match(renew, /restoring the previous certificate/)
  assert.match(renew, /CRITICAL: ACME recovery did not restore a verified HTTPS service/)
  assert.match(renew, /compose start nginx/)
  assert.ok(
    renew.indexOf("nginx_stop_attempted=1") < renew.indexOf("compose stop --timeout 15 nginx")
  )
  assert.match(renew, /sudo -n true/)
  assert.match(renew, /install -d -m 700 -o "\$\(id -u\)" -g "\$\(id -g\)" "\$acme_root"/)
  assert.doesNotMatch(renew, /chown[^\n]+APP_DIR\/data["/ ]/)
  assert.match(renew, /install -m 644 -o root -g root/)
  assert.match(renew, /install -m 600 -o root -g root/)
  assert.match(renew, /chown 0:0/)
  assert.match(manual, /\/proc\/\$\$\/fd\/3/)
  assert.match(manual, /\/proc\/\$\$\/fd\/4/)
  assert.match(manual, /base64 --decode <&3/)
  assert.match(manual, /base64 --decode <&4/)
  assert.match(manual, /exec 3<&- 4<&-/)
  assert.doesNotMatch(manual, /TLS_CERT_B64|TLS_KEY_B64/)
  assert.match(manual, /checkhost www\.liaoqizai\.site/)
  assert.match(manual, /install -m 644 -o root -g root/)
  assert.match(manual, /install -m 600 -o root -g root/)
  assert.match(manual, /CRITICAL: TLS recovery did not restore a verified HTTPS service/)
  assert.match(check, /checkhost liaoqizai\.site/)
  assert.match(check, /checkhost www\.liaoqizai\.site/)
  assert.match(check, /Live TLS certificate does not match the installed certificate/)
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
  assert.match(install, /UMask=0077/)
  assert.match(install, /chmod 700 "\$agent_workdir"/)
  assert.match(install, /-name 'agent\*\.log'/)
  assert.match(install, /agent\(-\[0-9\]\{4\}/)
  assert.match(install, /chmod 600 -- \{\}/)
  assert.match(install, /chown "root:\$agent_group" "\$agent_wrapper"/)
  assert.match(install, /chmod 750 "\$agent_wrapper"/)
  assert.match(install, /agent-workdir\.meta/)
  assert.match(install, /agent-wrapper\.meta/)
  assert.match(install, /agent-logs\.meta/)
  assert.match(install, /stat --format='%a %u %g'/)
  assert.match(install, /ROLLBACK_DIR=/)
  assert.match(rollback, /journal_target="\/etc\/systemd\/journald\.conf\.d\/qzsite\.conf"/)
  assert.match(rollback, /agent_target="\/etc\/systemd\/system\/gitee-go-agent\.service\.d\/qzsite-logging\.conf"/)
  assert.match(rollback, /read_mode_owner/)
  assert.match(rollback, /apply_mode_owner/)
  assert.match(rollback, /agent-logs\.meta/)
  assert.match(rollback, /Skipping metadata restore for a rotated Gitee Agent log/)
  assert.match(install, /\/var\/lib\/qzsite\/host-log-governance/)
  assert.match(install, /prepare_operation_lock/)
  assert.match(install, /Existing host governance drop-in must be root-owned mode 644/)
  assert.match(install, /Existing host governance drop-in must not be a symbolic link/)
  assert.match(install, /sudo mktemp -d/)
  assert.match(rollback, /Rollback directory is not root-owned mode 700/)
  assert.match(rollback, /Rollback file is not root-owned mode 600/)
  assert.match(rollback, /Inherited operation lock descriptor is missing/)
  assert.match(rollback, /Inherited operation lock is not held/)
  assert.match(rollback, /sudo cmp --silent -- "\$rollback_dir\/agent\.conf" "\$agent_target"/)
  assert.match(rollback, /sudo stat --format='%u:%g:%a' -- "\$journal_target"/)
  assert.match(rollback, /rollback_failed=0/)
  assert.match(rollback, /Host log governance rollback was incomplete/)
  assert.doesNotMatch(rollback, /done < <\(sudo cat/)
})
