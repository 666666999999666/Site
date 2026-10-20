import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const previous = "a".repeat(40)
const target = "b".repeat(40)
const fingerprint = "c".repeat(64)
const repository = "ccr.ccs.tencentyun.com/lqzzql/web"
const oldImage = `${repository}@sha256:${"d".repeat(64)}`
const newImage = `${repository}@sha256:${"e".repeat(64)}`

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "release-recovery-execution-"))
  const calls = path.join(root, "calls")
  const common = path.join(root, "common.sh")
  // No production common initialization, locks, daemon, network, or Git worktree.
  // Every external command used by the scripts is replaced with a Bash function.
  writeFileSync(common, `set -Eeuo pipefail
APP_DIR=${JSON.stringify(root)}
BACKUP_DIR="$APP_DIR/backups"
OPERATION_LOCK_PATH="$APP_DIR/operation.lock"
CALLS=${JSON.stringify(calls)}
log() { printf '%s\\n' "$*"; }
fail() { printf '%s\\n' "$*" >&2; exit 1; }
require_file() { [[ -f "$1" ]] || fail "Required file is missing: $1"; }
prepare_operation_lock() { :; }
compose() { printf 'compose %s\\n' "$*" >> "$CALLS"; if [[ "$1" == ps ]]; then echo web-fixture; fi; }
git() {
  printf 'git %s\\n' "$*" >> "$CALLS"
  case "$1" in
    rev-parse) echo "\${MOCK_GIT_SHA:-${target}}";;
    diff) [[ "\${MOCK_DIRTY:-0}" == 0 ]];;
    cat-file|checkout) :;;
    *) fail "Unexpected git call: $*";;
  esac
}
docker() {
  printf 'docker %s\\n' "$*" >> "$CALLS"
  if [[ "$1 $2" == 'image inspect' ]]; then
    [[ "\${MOCK_IMAGE_MISSING:-0}" == 0 ]] || return 1
    case "$*" in
      *org.opencontainers.image.revision*) echo "\${MOCK_REVISION:-${target}}";;
      *Config.Env*) printf 'APP_RELEASE_SHA=%s\\n' "\${MOCK_IMAGE_SHA:-${target}}";;
      *'{{.Id}}'*) echo sha256:fixture;;
    esac
  elif [[ "$1" == inspect ]]; then
    case "$*" in
      *State.Running*) echo "\${MOCK_RUNNING:-true}";;
      *'{{.Image}}'*) echo "\${MOCK_RUNNING_IMAGE:-sha256:fixture}";;
      *Config.Env*) printf 'APP_RELEASE_SHA=%s\\n' "\${MOCK_CONTAINER_SHA:-${target}}";;
      *) fail "Unexpected inspect: $*";;
    esac
  elif [[ "$1" == run ]]; then
    echo "\${MOCK_SOURCE_FINGERPRINT:-${fingerprint}}"
  elif [[ "$1" == exec ]]; then
    case "$*" in
      *'/app/.source-fingerprint'*) echo "\${MOCK_IMAGE_FINGERPRINT:-${fingerprint}}";;
      *'node -e'*) [[ "\${MOCK_HEALTH_FAIL:-0}" == 0 ]] || return 1; echo "\${MOCK_HEALTH_SHA:-${target}}";;
      *) fail "Unexpected exec: $*";;
    esac
  else
    fail "Unexpected docker call: $*"
  fi
}
`)
  writeFileSync(path.join(root, ".env"), `WEB_IMAGE=${newImage}\nAPP_RELEASE_SHA=${target}\n`)
  writeFileSync(path.join(root, ".deploy-state"), `${target} ${newImage} ${fingerprint}\n`)
  return {
    root, calls, common,
    run(script: string, env: Record<string, string> = {}, args: string[] = []) {
      rmSync(calls, { force: true })
      return spawnSync("bash", [path.resolve(script), ...args], {
        encoding: "utf8", timeout: 10000,
        env: { ...process.env, QZSITE_OPS_COMMON: common, ...env },
      })
    },
    recorded: () => existsSync(calls) ? readFileSync(calls, "utf8") : "",
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

test("release verifier executes exact identity checks and rejects every mismatched layer", { skip: process.platform === "win32" }, () => {
  const f = fixture()
  try {
    const ok = f.run("ops/verify-release.sh")
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /Release provenance verified/)
    assert.match(f.recorded(), /--pull never --read-only --network none/)
    const cases = [
      [{ EXPECTED_RELEASE_SHA: previous }, /Expected release SHA/],
      [{ MOCK_GIT_SHA: previous }, /Checked-out source/],
      [{ MOCK_DIRTY: "1" }, /unstaged changes/],
      [{ MOCK_REVISION: previous }, /OCI image revision/],
      [{ MOCK_IMAGE_SHA: previous }, /Image APP_RELEASE_SHA/],
      [{ MOCK_RUNNING: "false" }, /Web container is not running/],
      [{ MOCK_RUNNING_IMAGE: "sha256:wrong" }, /recorded image/],
      [{ MOCK_CONTAINER_SHA: previous }, /wrong APP_RELEASE_SHA/],
      [{ MOCK_IMAGE_FINGERPRINT: "f".repeat(64) }, /image fingerprint/],
      [{ MOCK_SOURCE_FINGERPRINT: "f".repeat(64) }, /source does not match the running image/],
      [{ MOCK_HEALTH_SHA: previous }, /Health endpoint release SHA/],
      [{ QZSITE_ALLOW_LEGACY_RELEASE: "1" }, /Legacy rollback must not carry/],
    ] as const
    for (const [env, message] of cases) {
      const result = f.run("ops/verify-release.sh", env)
      assert.notEqual(result.status, 0, JSON.stringify(env))
      assert.match(result.stderr, message)
    }
    assert.notEqual(f.run("ops/verify-release.sh", { MOCK_HEALTH_FAIL: "1" }).status, 0)
    writeFileSync(path.join(f.root, ".env"), `WEB_IMAGE=${oldImage}\nAPP_RELEASE_SHA=${target}\n`)
    assert.match(f.run("ops/verify-release.sh").stderr, /Configured WEB_IMAGE/)
    writeFileSync(path.join(f.root, ".deploy-state"), `${target} mutable:tag ${fingerprint}\n`)
    assert.match(f.run("ops/verify-release.sh").stderr, /invalid image digest/)
  } finally { f.cleanup() }
})

function watchdogFixture() {
  const f = fixture()
  const env: Record<string, string> = {}
  for (const action of ["SMOKE", "VERIFY", "PREPARE"]) {
    const script = path.join(f.root, `${action.toLowerCase()}.sh`)
    writeFileSync(script, `set -eu
printf '${action} %s %s\\n' "\${EXPECTED_RELEASE_SHA:-none}" "$*" >> ${JSON.stringify(f.calls)}
[[ "\${MOCK_FAIL_ACTION:-}" != '${action}' ]] || exit 19
`)
    env[`QZSITE_WATCHDOG_${action}`] = script
  }
  const pending = path.join(f.root, ".deploy-pending")
  const state = path.join(f.root, ".deploy-state")
  function reset(candidate = false, created = 1) {
    writeFileSync(pending, `${target} ${newImage} ${fingerprint} ${previous} ${oldImage} ${fingerprint} ${created}\n`)
    writeFileSync(state, `${candidate ? target : previous} ${candidate ? newImage : oldImage} ${fingerprint}\n`)
    rmSync(path.join(f.root, ".deploy-history"), { force: true })
  }
  return { ...f, pending, state, reset, runWatchdog: (extra: Record<string, string> = {}) => f.run("ops/deploy-watchdog.sh", { ...env, ...extra }) }
}

test("watchdog resolves ambiguous candidate commit without repeating deployment", { skip: process.platform === "win32" }, () => {
  const f = watchdogFixture()
  try {
    f.reset(true)
    const result = f.runWatchdog()
    assert.equal(result.status, 0, result.stderr)
    assert.equal(existsSync(f.pending), false)
    assert.match(readFileSync(path.join(f.root, ".deploy-history"), "utf8"), new RegExp(target))
    assert.doesNotMatch(f.recorded(), /git checkout|compose up/)
    assert.match(f.recorded(), /SMOKE .* public/)
    assert.equal(f.runWatchdog().status, 0)
    assert.equal(f.recorded(), "")
  } finally { f.cleanup() }
})

test("watchdog recovers expired pending locally and preserves evidence on incomplete rollback", { skip: process.platform === "win32" }, () => {
  const f = watchdogFixture()
  try {
    f.reset(false, Math.floor(Date.now() / 1000))
    assert.equal(f.runWatchdog().status, 0)
    assert.equal(existsSync(f.pending), true)
    assert.equal(f.recorded(), "")
    f.reset()
    const recovered = f.runWatchdog({ MOCK_REVISION: previous, MOCK_IMAGE_SHA: previous })
    assert.equal(recovered.status, 0, recovered.stderr)
    assert.equal(existsSync(f.pending), false)
    assert.match(f.recorded(), /compose up --pull never/)
    assert.doesNotMatch(f.recorded(), /docker pull|compose pull/)
    assert.match(readFileSync(f.state, "utf8"), new RegExp(previous))
    for (const failure of ["PREPARE", "SMOKE", "VERIFY"]) {
      f.reset()
      const failed = f.runWatchdog({ MOCK_REVISION: previous, MOCK_IMAGE_SHA: previous, MOCK_FAIL_ACTION: failure })
      assert.notEqual(failed.status, 0)
      assert.equal(existsSync(f.pending), true, `${failure} must preserve pending`)
    }
    f.reset()
    const missing = f.runWatchdog({ MOCK_IMAGE_MISSING: "1" })
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /unavailable locally/)
    assert.doesNotMatch(f.recorded(), /git checkout|compose up/)
    assert.equal(existsSync(f.pending), true)
    f.reset()
    writeFileSync(f.state, `${"f".repeat(40)} ${oldImage} ${fingerprint}\n`)
    assert.match(f.runWatchdog().stderr, /does not agree/)
    assert.doesNotMatch(f.recorded(), /git checkout|docker/)
  } finally { f.cleanup() }
})

test("failed candidate confirmation invokes local rollback and retains pending when validation fails", { skip: process.platform === "win32" }, () => {
  const f = watchdogFixture()
  try {
    f.reset(true)
    const failed = f.runWatchdog({ MOCK_FAIL_ACTION: "VERIFY", MOCK_REVISION: previous, MOCK_IMAGE_SHA: previous })
    assert.notEqual(failed.status, 0)
    assert.match(failed.stdout, /Candidate confirmation failed/)
    assert.match(f.recorded(), /git checkout --force -B main/)
    assert.equal(existsSync(f.pending), true)
    assert.match(readFileSync(f.state, "utf8"), new RegExp(previous))
  } finally { f.cleanup() }
})

test("backup retention dry-run preserves incomplete, manual, verified and newest sets", { skip: process.platform === "win32" }, () => {
  const f = fixture()
  try {
    const backups = path.join(f.root, "backups")
    mkdirSync(backups)
    const suffixes = [".dump", "-uploads.tar.gz", "-study-uploads.tar.gz", ".sha256"]
    const set = (day: number, label: string) => `qzsite-202601${String(day).padStart(2, "0")}T010203Z-${label}`
    function create(name: string, complete = true) {
      for (const suffix of complete ? suffixes : suffixes.slice(0, 1)) writeFileSync(path.join(backups, name + suffix), "fixture")
    }
    for (let day = 1; day <= 7; day++) create(set(day, "predeploy"))
    for (let day = 1; day <= 5; day++) create(set(day, "storage-cleanup"))
    for (let day = 1; day <= 4; day++) create(set(day, "migration"))
    create(set(1, "manual"))
    create(set(8, "predeploy"), false)
    writeFileSync(path.join(backups, ".last-verified-backup"), set(1, "predeploy") + "\n")
    const source = readFileSync("ops/backup.sh", "utf8")
    const retention = source.slice(source.indexOf("declare -A pruned_backup_sets=()"), source.indexOf('log "Backup complete:'))
    const script = path.join(f.root, "retention-dry-run.sh")
    // Execute the production retention algorithm verbatim, but intercept ALL rm
    // calls. Fixture files remain present; no real retention policy is changed.
    writeFileSync(script, `source "$QZSITE_OPS_COMMON"\nrm() { printf 'dry-run-rm %s\\n' "$*" >> "$CALLS"; }\n${retention}`)
    const result = f.run(script)
    assert.equal(result.status, 0, result.stderr)
    const calls = f.recorded()
    assert.match(calls, new RegExp(set(2, "predeploy")))
    assert.match(calls, new RegExp(set(1, "storage-cleanup")))
    assert.match(calls, new RegExp(set(2, "storage-cleanup")))
    assert.match(calls, new RegExp(set(1, "migration")))
    for (const protectedSet of [set(1, "predeploy"), set(7, "predeploy"), set(8, "predeploy"), set(1, "manual")]) {
      assert.ok(!calls.includes(protectedSet), `${protectedSet} must be preserved`)
    }
    assert.equal(calls.trim().split("\n").length, 4)
    for (let day = 1; day <= 7; day++) {
      for (const suffix of suffixes) assert.ok(existsSync(path.join(backups, set(day, "predeploy") + suffix)))
    }
  } finally { f.cleanup() }
})


test("backup verifier executes archive/hash gates before any isolated restore", { skip: process.platform === "win32" }, () => {
  const f = fixture()
  try {
    const backups = path.join(f.root, "backups")
    const payload = path.join(f.root, "payload")
    mkdirSync(backups)
    mkdirSync(path.join(payload, "uploads"), { recursive: true })
    mkdirSync(path.join(payload, "study-uploads"))
    writeFileSync(path.join(payload, "uploads", "public.txt"), "fixture")
    const base = "qzsite-20261020T010203Z-manual"
    const dump = path.join(backups, base + ".dump")
    writeFileSync(dump, "mock database dump")
    const uploads = base + "-uploads.tar.gz"
    const study = base + "-study-uploads.tar.gz"
    const manifest = path.join(backups, base + ".sha256")
    function archives() {
      execFileSync("tar", ["-czf", path.join(backups, uploads), "-C", payload, "uploads"])
      execFileSync("tar", ["-czf", path.join(backups, study), "-C", payload, "study-uploads"])
    }
    function hashes(names = [base + ".dump", uploads, study]) {
      writeFileSync(manifest, execFileSync("sha256sum", names, { cwd: backups }))
    }
    // pg_restore itself is deliberately stubbed: this proves gates and marker
    // lifecycle, not PostgreSQL restore or migration compatibility.
    writeFileSync(f.common, readFileSync(f.common, "utf8") + `
 docker() {
   printf 'docker %s\\n' "$*" >> "$CALLS"
   case "$1" in
     run|rm) return 0;;
     exec)
       case "$*" in
         *pg_isready*) return 0;;
         *pg_restore*) [[ "\${MOCK_RESTORE_FAIL:-0}" == 0 ]];;
         *to_regclass*) echo t;;
         *json_build_object*) echo '{"questions":0,"posts":0}';;
         *storageKey*) :;;
         *) fail "Unexpected database call: $*";;
       esac;;
     *) fail "Unexpected Docker call: $*";;
   esac
 }
`)
    archives()
    hashes()
    let result = f.run("ops/verify-backup.sh", {}, [dump])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Restore verified/)
    const marker = path.join(backups, ".last-verified-backup")
    assert.equal(readFileSync(marker, "utf8"), base + "\n")
    rmSync(marker)
    result = f.run("ops/verify-backup.sh", { MOCK_RESTORE_FAIL: "1" }, [dump])
    assert.notEqual(result.status, 0)
    assert.equal(existsSync(marker), false)
    assert.match(f.recorded(), /docker rm --force/)
    writeFileSync(dump, "corrupted")
    result = f.run("ops/verify-backup.sh", {}, [dump])
    assert.notEqual(result.status, 0)
    assert.equal(f.recorded(), "")
    hashes()
    hashes([base + ".dump", uploads, uploads])
    result = f.run("ops/verify-backup.sh", {}, [dump])
    assert.match(result.stderr, /missing or duplicated/)
    assert.equal(f.recorded(), "")
    symlinkSync("public.txt", path.join(payload, "uploads", "link.txt"))
    archives()
    hashes()
    result = f.run("ops/verify-backup.sh", {}, [dump])
    assert.match(result.stderr, /Links and non-regular files/)
    assert.equal(f.recorded(), "")
    rmSync(path.join(payload, "uploads", "link.txt"))
    archives()
    rmSync(path.join(backups, study))
    hashes([base + ".dump", uploads])
    result = f.run("ops/verify-backup.sh", {}, [dump])
    assert.match(result.stderr, /Private study uploads archive is required/)
    assert.equal(existsSync(marker), false)
  } finally { f.cleanup() }
})

test("public smoke rejects unhealthy, missing or wrong release identity before route checks", { skip: process.platform === "win32" }, () => {
  const f = fixture()
  try {
    writeFileSync(f.common, readFileSync(f.common, "utf8") + `
curl() {
  printf 'curl %s\\n' "$*" >> "$CALLS"
  [[ "\${MOCK_HTTP_FAIL:-0}" == 0 ]] || return 22
  printf '%s' "$MOCK_HEALTH_JSON"
}
`)
    const cases = [
      ['{"status":"error","releaseSha":"' + target + '"}', /unexpected response/],
      ['{"status":"ok"}', /did not return a valid release SHA/],
      ['{"status":"ok","releaseSha":"' + previous + '"}', /wrong release SHA/],
      ['{"status":"ok","releaseSha":"short"}', /did not return a valid release SHA/],
    ] as const
    for (const [payload, error] of cases) {
      const result = f.run("ops/smoke-test.sh", { EXPECTED_RELEASE_SHA: target, MOCK_HEALTH_JSON: payload }, ["public"])
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, error)
      assert.equal(f.recorded().trim().split("\n").length, 1)
      assert.doesNotMatch(f.recorded(), /--resolve/)
    }
    assert.notEqual(f.run("ops/smoke-test.sh", { EXPECTED_RELEASE_SHA: target, MOCK_HTTP_FAIL: "1" }, ["public"]).status, 0)
  } finally { f.cleanup() }
})
