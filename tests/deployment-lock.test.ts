import assert from "node:assert/strict"
import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

// These tests execute the real pipeline shell and the real entry/deploy prefix
// through their first fetch. The entry prefix then invokes the deploy prefix:
// launcher installation, backups, image operations and service switching never
// run. Only the fixed application/lock paths are relocated to our private temp
// fixture. flock and Git are real; Git can use only a local bare file remote.
const productionLock = "/tmp/qzsite-operation.lock"
const productionGit = "https://gitee.com/lqzzql/Site.git"
const registry = "ccr.ccs.tencentyun.com/lqzzql/web"
const linuxOnly = process.platform !== "linux" ? "requires Linux /proc and real flock; no Windows Bash approximation" : false
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

function pipelineShell() {
  const yaml = readFileSync(".workflow/pipeline-deploy.yml", "utf8").replaceAll("\r\n", "\n")
  const blocks = [...yaml.matchAll(/^    script: \|-\n((?:      .*\n|\n)+)/gm)]
  assert.equal(blocks.length, 1, "the exact production deploy shell must remain unambiguous")
  return blocks[0][1].split("\n").map((line) => line.startsWith("      ") ? line.slice(6) : line).join("\n")
}

function firstFetchPrefix(source: string, label: string) {
  const lines = source.replaceAll("\r\n", "\n").split("\n")
  const fetches = lines.flatMap((line, index) => line.startsWith('git fetch --prune --no-tags "$production_git_url" ') ? [index] : [])
  assert.equal(fetches.length, 1, `${label} must expose one explicit canonical fetch`)
  return lines.slice(0, fetches[0] + 1).join("\n") + "\n"
}

function relocateLock(source: string, lock: string, label: string) {
  const count = source.split(productionLock).length - 1
  // The old vulnerable pipeline/entry have no lock literal at all: permitting
  // zero lets the behavioral regression fail at the concurrent fetch barrier,
  // rather than manufacturing a lock in the baseline fixture.
  assert.ok(count === 0 || count === 1, `${label} unexpectedly repeats its fixed operation-lock path`)
  const changed = source.replaceAll(productionLock, lock)
  assert.equal(changed.includes(productionLock), false, `${label} could access the host operation lock`)
  assert.equal(changed.split(lock).length - 1, count, `${label} lock relocation count changed`)
  return changed
}

interface Running {
  child: ChildProcess
  result: Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>
  output: () => { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "qzsite-deployment-lock-"))
  const app = path.join(root, "app"), bin = path.join(root, "bin"), state = path.join(root, "state")
  const lock = path.join(root, "operation.lock"), bare = path.join(root, "remote.git")
  const git = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim()
  const flock = execFileSync("sh", ["-c", "command -v flock"], { encoding: "utf8" }).trim()
  assert.ok(git.startsWith("/") && flock.startsWith("/"))
  for (const directory of [app, bin, state, path.join(app, "ops")]) mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(app, 0o700)
  const commonSource = readFileSync("ops/common.sh", "utf8")
  assert.equal(commonSource.split(productionLock).length - 1, 1, "common.sh must define the real fixed operation lock once")
  const common = relocateLock(commonSource, lock, "common")
  const entry = relocateLock(firstFetchPrefix(readFileSync("ops/deploy-entry.sh", "utf8"), "entry"), lock, "entry")
    + 'bash "$app_dir/ops/deploy-prefix.sh" "$revision" "$requested_image"\n'
  const deploy = relocateLock(firstFetchPrefix(readFileSync("ops/deploy.sh", "utf8"), "deploy"), lock, "deploy")
  const rawPipeline = pipelineShell()
  const fixedCd = "cd /home/ubuntu/个人网站"
  assert.equal(rawPipeline.split(fixedCd).length - 1, 1, "relocate only the known production working-directory line")
  const pipeline = relocateLock(rawPipeline.replace(fixedCd, `cd ${quote(app)}`), lock, "pipeline")
  writeFileSync(path.join(app, ".env"), "# isolated lock test; no production credentials\n", { mode: 0o600 })
  writeFileSync(path.join(app, "ops", "common.sh"), common)
  writeFileSync(path.join(app, "ops", "deploy-entry.sh"), entry)
  writeFileSync(path.join(app, "ops", "deploy-prefix.sh"), deploy)
  const pipelineFile = path.join(root, "pipeline.sh")
  writeFileSync(pipelineFile, pipeline)

  const setupEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH, HOME: root, LANG: "C", LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_ALLOW_PROTOCOL: "file", GIT_TERMINAL_PROMPT: "0" }
  const realGit = (args: string[]) => execFileSync(git, ["-C", app, ...args], { env: setupEnv, stdio: "pipe", encoding: "utf8" })
  realGit(["init", "--initial-branch=main"])
  realGit(["config", "user.name", "Isolated Deployment Lock Test"])
  realGit(["config", "user.email", "deployment-lock@example.invalid"])
  realGit(["config", "core.autocrlf", "false"])
  realGit(["add", "."])
  realGit(["commit", "-m", "isolated actual entry and deploy lock prefixes"])
  execFileSync(git, ["init", "--bare", "--initial-branch=main", bare], { env: setupEnv, stdio: "pipe" })
  realGit(["push", bare, "main"])
  realGit(["config", `url.${bare}.insteadOf`, productionGit])
  const sha = realGit(["rev-parse", "HEAD"]).trim()
  assert.match(sha, /^[a-f0-9]{40}$/)
  const writer = path.join(root, "isolated-remote-writer")
  function timed<T>(label: string, run: () => T) {
    const started = Date.now()
    appendFileSync(path.join(state, "events"), `local-advance\t${label}\tstart\t${started}\n`)
    const result = run()
    appendFileSync(path.join(state, "events"), `local-advance\t${label}\tdone\t${Date.now() - started}ms\n`)
    return result
  }
  const writerGit = (args: string[]) => timed(args[0], () => execFileSync(git, ["-C", writer, ...args], { env: setupEnv, stdio: "pipe", encoding: "utf8" }))
  function prepareRemoteWriter() {
    // Clone/configure a writer before queuing the pipeline. Only the commit and
    // real local-bare push belong inside the bounded lock-contention window.
    timed("clone", () => execFileSync(git, ["clone", "--no-hardlinks", bare, writer], { env: setupEnv, stdio: "pipe" }))
    writerGit(["config", "user.name", "Isolated Remote Main Advance"])
    writerGit(["config", "user.email", "deployment-lock@example.invalid"])
    assert.equal(writerGit(["rev-parse", "HEAD"]).trim(), sha)
  }
  function advanceRemote() {
    assert.ok(existsSync(path.join(writer, ".git")), "prepare the local writer before locking, then advance main while queued")
    writeFileSync(path.join(writer, "remote-advance.txt"), "local-only next candidate while another pipeline waits for its operation lock\n")
    writerGit(["add", "remote-advance.txt"])
    writerGit(["commit", "-m", "advance only the local bare test main"])
    const next = writerGit(["rev-parse", "HEAD"]).trim()
    assert.match(next, /^[a-f0-9]{40}$/); assert.notEqual(next, sha)
    writerGit(["push", bare, "main"])
    assert.equal(realGit(["rev-parse", "HEAD"]).trim(), sha, "the waiting application's checked-out commit must remain unchanged")
    return next
  }

  writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env bash
set -eu
case "\${1:-}" in
  login) cat >/dev/null; : > "$LOCK_TEST_STATE/$LOCK_TEST_JOB.docker-login" ;;
  logout)
    if [ "\${LOCK_TEST_HOLD_CLEANUP:-0}" = 1 ]; then
      printf '%s\\tcleanup-enter\\n' "$LOCK_TEST_JOB" >> "$LOCK_TEST_STATE/events"
      : > "$LOCK_TEST_STATE/$LOCK_TEST_JOB.cleanup-enter"
      attempts=0
      while [ ! -e "$LOCK_TEST_STATE/release-cleanup" ]; do
        attempts=$((attempts + 1)); [ "$attempts" -le 600 ] || exit 88
        sleep 0.02
      done
    fi
    ;;
  *) printf 'Unexpected Docker command in lock-only test\\n' >&2; exit 91 ;;
esac
`, { mode: 0o700 })
  writeFileSync(path.join(bin, "flock"), `#!/usr/bin/env bash
set -eu
printf '%s\\tflock-attempt\\t%s\\n' "$LOCK_TEST_JOB" "$*" >> "$LOCK_TEST_STATE/events"
: > "$LOCK_TEST_STATE/$LOCK_TEST_JOB.flock-attempt"
exec ${quote(flock)} "$@"
`, { mode: 0o700 })
  writeFileSync(path.join(bin, "git"), `#!/usr/bin/env bash
set -eu
case "\${1:-}" in
  fetch)
    counter="$LOCK_TEST_STATE/$LOCK_TEST_JOB.fetch-count"
    number=0; [ ! -f "$counter" ] || read -r number < "$counter"
    number=$((number + 1)); printf '%s\\n' "$number" > "$counter"
    printf '%s\\tfetch-enter\\t%s\\n' "$LOCK_TEST_JOB" "$number" >> "$LOCK_TEST_STATE/events"
    : > "$LOCK_TEST_STATE/$LOCK_TEST_JOB.fetch-$number"
    owns_active=0
    if mkdir "$LOCK_TEST_STATE/active-fetch" 2>/dev/null; then owns_active=1
    else : > "$LOCK_TEST_STATE/overlapping-fetch"; fi
    cleanup() {
      original=$?
      trap - EXIT HUP INT TERM
      if [ "$owns_active" -eq 1 ]; then rmdir "$LOCK_TEST_STATE/active-fetch"; fi
      printf '%s\\tfetch-exit\\t%s\\t%s\\n' "$LOCK_TEST_JOB" "$number" "$original" >> "$LOCK_TEST_STATE/events"
      exit "$original"
    }
    trap cleanup EXIT
    trap 'exit 143' TERM
    trap 'exit 130' INT
    if [ "\${LOCK_TEST_HOLD_FIRST:-0}" = 1 ] && [ "$number" -eq 1 ]; then
      attempts=0
      while [ ! -e "$LOCK_TEST_STATE/release-first" ]; do
        attempts=$((attempts + 1)); [ "$attempts" -le 600 ] || exit 88
        sleep 0.02
      done
    fi
    if [ "\${LOCK_TEST_FAIL_FETCH:-0}" = "$number" ]; then exit 37; fi
    ${quote(git)} "$@"
    ;;
  rev-parse|show|cat-file) exec ${quote(git)} "$@" ;;
  *) printf 'Unexpected Git command in lock-only test\\n' >&2; exit 92 ;;
esac
`, { mode: 0o700 })
  const env: NodeJS.ProcessEnv = {
    ...setupEnv, PATH: `${bin}:${process.env.PATH ?? ""}`, LOCK_TEST_STATE: state,
    GITEE_COMMIT: sha, GITEE_DOCKER_IMAGE: `${registry}:${sha}`,
    TCR_USERNAME: "isolated-not-a-registry-account", TCR_PASSWORD: "synthetic-not-a-real-token",
    QZSITE_DEPLOY_LOCK_WAIT_SECONDS: "5",
  }
  const children: Running[] = []
  function start(job: string, kind: "pipeline" | "entry" | "deploy" | "holder" = "pipeline", extra: Partial<NodeJS.ProcessEnv> = {}, descriptor: "closed" | "wrong" | "same-unlocked" = "closed") {
    const command = kind === "pipeline" ? ["sh", pipelineFile]
      : kind === "entry" ? ["bash", path.join(app, "ops", "deploy-entry.sh"), sha, `${registry}:${sha}`]
        : kind === "deploy" ? ["bash", path.join(app, "ops", "deploy-prefix.sh"), sha, `${registry}:${sha}`]
          : ["bash", "-c", `source ${quote(path.join(app, "ops", "common.sh"))}; prepare_operation_lock; exec 9>>"$OPERATION_LOCK_PATH"; flock -w 5 9; : > "$LOCK_TEST_STATE/holder-ready"; while [ ! -e "$LOCK_TEST_STATE/release-holder" ]; do sleep 0.02; done`]
    const launcher = descriptor === "closed" ? 'exec 9>&-; exec "$@"' : 'exec 9>>"$LOCK_TEST_DESCRIPTOR"; exec "$@"'
    const child = spawn("bash", ["-c", launcher, "_", ...command], { cwd: app, env: { ...env, LOCK_TEST_JOB: job, LOCK_TEST_DESCRIPTOR: descriptor === "same-unlocked" ? lock : path.join(root, "wrong-descriptor.lock"), ...extra }, detached: true, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = "", stderr = ""
    child.stdout?.on("data", (data) => { stdout += data.toString() })
    child.stderr?.on("data", (data) => { stderr += data.toString() })
    const running: Running = { child, output: () => ({ code: child.exitCode, signal: child.signalCode, stdout, stderr }), result: new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }))
    }) }
    children.push(running)
    return running
  }
  const has = (name: string) => existsSync(path.join(state, name))
  const release = (name: string) => {
    appendFileSync(path.join(state, "events"), `controller\trelease\t${name}\t${Date.now()}\n`)
    writeFileSync(path.join(state, name), "release\n")
  }
  const events = () => existsSync(path.join(state, "events")) ? readFileSync(path.join(state, "events"), "utf8") : ""
  async function waitFor(check: () => boolean, message: string) {
    const until = Date.now() + 5000
    while (!check()) { assert.ok(Date.now() < until, `${message}\n${events()}\n${JSON.stringify(children.map((running) => running.output()), null, 2)}`); await delay(10) }
  }
  async function finish(running: Running, timeout = 8000) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([running.result, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`isolated operation did not finish; possible nested-lock deadlock\n${events()}`)), timeout) })]) }
    finally { if (timer) clearTimeout(timer) }
  }
  async function cleanup() {
    release("release-first"); release("release-holder"); release("release-cleanup")
    for (const running of children) {
      if (running.child.exitCode === null && running.child.signalCode === null && running.child.pid) {
        try { process.kill(-running.child.pid, "SIGTERM") } catch { /* already completed */ }
      }
    }
    await Promise.allSettled(children.map((running) => finish(running, 1500)))
    for (const running of children) {
      if (running.child.exitCode === null && running.child.signalCode === null && running.child.pid) {
        try { process.kill(-running.child.pid, "SIGKILL") } catch { /* already completed */ }
      }
    }
    await Promise.allSettled(children.map((running) => running.result))
    rmSync(root, { recursive: true, force: true })
  }
  return { root, app, lock, sha, state, start, has, release, events, waitFor, finish, cleanup, prepareRemoteWriter, advanceRemote }
}

test("the real pipeline holds one inherited operation lock before every concurrent canonical fetch", { skip: linuxOnly }, async () => {
  const f = fixture()
  try {
    const first = f.start("first", "pipeline", { LOCK_TEST_HOLD_FIRST: "1", LOCK_TEST_HOLD_CLEANUP: "1" })
    await f.waitFor(() => f.has("first.fetch-1"), "first pipeline never reached its synchronized fetch")
    const second = f.start("second")
    await f.waitFor(() => f.has("second.flock-attempt") || f.has("second.fetch-1"), "second pipeline never attempted the shared lock or fetch")
    await delay(100)
    assert.equal(f.has("second.fetch-1"), false, `the second pipeline crossed the held lock and entered fetch\n${f.events()}`)
    assert.equal(f.has("overlapping-fetch"), false, `the two real fetch prefixes overlapped\n${f.events()}`)
    f.release("release-first")
    await f.waitFor(() => f.has("first.cleanup-enter"), "first pipeline never reached its real outer EXIT cleanup")
    assert.equal(f.has("first.fetch-3"), true, "cleanup barrier must run after all three real fetch prefixes completed")
    await delay(100)
    assert.equal(f.has("second.fetch-1"), false, `the second pipeline fetched while the first outer EXIT cleanup was still held\n${f.events()}`)
    f.release("release-cleanup")
    const [one, two] = await Promise.all([f.finish(first), f.finish(second)])
    assert.equal(one.code, 0, one.stderr); assert.equal(two.code, 0, two.stderr)
    assert.equal(f.has("first.fetch-3"), true, "pipeline -> real entry prefix -> real deploy prefix must reuse FD 9 without deadlock")
    assert.equal(f.has("second.fetch-3"), true)
    assert.equal(f.has("overlapping-fetch"), false, f.events())
    const timeline = f.events().split("\n")
    const firstDeployFetch = timeline.findIndex((line) => line === "first\tfetch-enter\t3")
    const secondPipelineFetch = timeline.findIndex((line) => line === "second\tfetch-enter\t1")
    assert.ok(firstDeployFetch >= 0 && secondPipelineFetch > firstDeployFetch, `the second pipeline must fetch only after the first nested deploy fetch\n${f.events()}`)
    const configured = execFileSync("git", ["-C", f.app, "config", "--local", "--get-regexp", "^url\\..*\\.insteadof$"], { encoding: "utf8" })
    assert.match(configured, /remote\.git/)
    assert.match(configured, /https:\/\/gitee\.com\/lqzzql\/Site\.git/)
  } finally { await f.cleanup() }
})

test("a failed fetch at each inherited pipeline, entry and deploy layer preserves its exit code and releases the lock", { skip: linuxOnly }, async () => {
  for (const failedFetch of [1, 2, 3]) {
    const f = fixture()
    try {
      const first = f.start("failure", "pipeline", { LOCK_TEST_HOLD_FIRST: "1", LOCK_TEST_FAIL_FETCH: String(failedFetch) })
      await f.waitFor(() => f.has("failure.fetch-1"), "failing pipeline never reached its synchronized first fetch")
      const second = f.start("recovery")
      await f.waitFor(() => f.has("recovery.flock-attempt") || f.has("recovery.fetch-1"), "waiting pipeline never attempted the operation")
      await delay(100)
      assert.equal(f.has("recovery.fetch-1"), false, `a waiting pipeline fetched before layer ${failedFetch} failed\n${f.events()}`)
      f.release("release-first")
      const [failed, recovered] = await Promise.all([f.finish(first), f.finish(second)])
      assert.equal(failed.code, 37, `layer ${failedFetch}: ${failed.stderr}`)
      assert.equal(recovered.code, 0, recovered.stderr)
      assert.equal(f.has(`failure.fetch-${failedFetch}`), true, `the failure must occur at real fetch layer ${failedFetch}`)
      assert.equal(f.has(`failure.fetch-${failedFetch + 1}`), false, "the failed pipeline must not continue to the next fetch layer")
      assert.equal(f.has("recovery.fetch-3"), true)
      assert.equal(f.has("overlapping-fetch"), false, f.events())
    } finally { await f.cleanup() }
  }
})

test("lock wait timeouts prevent pipeline, entry and deploy fetches even with forged flags or an inherited descriptor", { skip: linuxOnly }, async () => {
  const f = fixture()
  try {
    const holder = f.start("holder", "holder")
    await f.waitFor(() => f.has("holder-ready"), "independent real flock holder did not become ready")
    for (const kind of ["pipeline", "entry", "deploy"] as const) {
      for (const descriptor of ["closed", "wrong", "same-unlocked"] as const) {
        const job = `${kind}-${descriptor}`
        const contender = f.start(job, kind, { QZSITE_DEPLOY_LOCK_WAIT_SECONDS: "0.2", QZSITE_OPERATION_LOCK_HELD: "1", QZSITE_DEPLOY_LOCK_HELD: "1" }, descriptor)
        const result = await f.finish(contender, 2500)
        assert.notEqual(result.code, 0, `${job} bypassed another process's operation lock`)
        assert.equal(result.signal, null, `${job} should time out through its real flock error handling`)
        assert.equal(f.has(`${job}.fetch-1`), false, `${job} fetched after a lock timeout`)
        assert.equal(f.has(`${job}.flock-attempt`), true, `${job} trusted an environment flag or FD number instead of calling real flock`)
      }
    }
    f.release("release-holder")
    assert.equal((await f.finish(holder)).code, 0)
    const after = f.start("after-holder")
    const released = await f.finish(after)
    assert.equal(released.code, 0, released.stderr)
    assert.equal(f.has("after-holder.fetch-3"), true)
    for (const [kind, fetchCount] of [["entry", 2], ["deploy", 1]] as const) {
      const job = `independent-${kind}`
      const independent = f.start(job, kind)
      const finished = await f.finish(independent)
      assert.equal(finished.code, 0, `${kind} must acquire its own operation lock without an inherited FD: ${finished.stderr}`)
      assert.equal(f.has(`${job}.fetch-${fetchCount}`), true)
      assert.equal(f.has(`${job}.fetch-${fetchCount + 1}`), false)
    }
  } finally { await f.cleanup() }
})

test("a queued pipeline fetches the advanced local remote after locking and rejects its stale requested SHA", { skip: linuxOnly }, async (context) => {
  const f = fixture()
  try {
    f.prepareRemoteWriter()
    const holder = f.start("holder", "holder")
    await f.waitFor(() => f.has("holder-ready"), "real operation holder did not become ready")
    const stale = f.start("stale-pipeline")
    await f.waitFor(() => f.has("stale-pipeline.flock-attempt") || f.has("stale-pipeline.fetch-1"), "queued pipeline never attempted the lock")
    await delay(100)
    assert.equal(f.has("stale-pipeline.fetch-1"), false, f.events())
    const advanced = f.advanceRemote()
    f.release("release-holder")
    assert.equal((await f.finish(holder)).code, 0)
    const rejected = await f.finish(stale)
    assert.notEqual(rejected.code, 0)
    assert.match(rejected.stderr, /Refusing a stale pipeline deployment/, `${JSON.stringify(rejected)}\n${f.events()}`)
    assert.equal(f.has("stale-pipeline.fetch-1"), true)
    assert.equal(f.has("stale-pipeline.fetch-2"), false, "a stale pipeline must never invoke even the entry's fetch")
    const fetched = execFileSync("git", ["-C", f.app, "rev-parse", "refs/remotes/gitee-production/main"], { encoding: "utf8" }).trim()
    assert.equal(fetched, advanced, "stale refusal must use the remote main actually fetched after the wait")
    assert.notEqual(fetched, f.sha)
    context.diagnostic(f.events())
  } finally { await f.cleanup() }
})
