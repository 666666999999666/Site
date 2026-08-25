import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const publisher = path.resolve("scripts/publish-release.mjs")

function git(cwd: string, args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function remoteMain(repository: string, remote: string) {
  return git(repository, ["ls-remote", remote, "refs/heads/main"]).split(/\s+/)[0]
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "qzsite-publish-release-"))
  const repository = path.join(root, "repository")
  const gitee = path.join(root, "gitee.git")
  const gitHub = path.join(root, "github.git")

  execFileSync("git", ["init", "--initial-branch=main", repository], { stdio: "pipe" })
  git(repository, ["config", "user.name", "QZ Site Test"])
  git(repository, ["config", "user.email", "test@example.invalid"])
  git(repository, ["config", "core.autocrlf", "false"])
  mkdirSync(path.join(repository, "scripts"), { recursive: true })
  copyFileSync(publisher, path.join(repository, "scripts", "publish-release.mjs"))
  writeFileSync(path.join(repository, "README.md"), "baseline\n")
  git(repository, ["add", "README.md", "scripts/publish-release.mjs"])
  git(repository, ["commit", "-m", "baseline"])
  const baseline = git(repository, ["rev-parse", "HEAD"])

  execFileSync("git", ["init", "--bare", gitee], { stdio: "pipe" })
  execFileSync("git", ["init", "--bare", gitHub], { stdio: "pipe" })
  git(repository, ["push", gitee, "HEAD:refs/heads/main"])
  git(repository, ["push", gitHub, "HEAD:refs/heads/main"])

  writeFileSync(path.join(repository, "README.md"), "next release\n")
  git(repository, ["add", "README.md"])
  git(repository, ["commit", "-m", "next release"])
  const releaseSha = git(repository, ["rev-parse", "HEAD"])

  return { root, repository, gitee, gitHub, baseline, releaseSha }
}

function runPublisher(
  fixture: ReturnType<typeof createFixture>,
  args: string[] = []
) {
  return spawnSync(
    process.execPath,
    [path.join(fixture.repository, "scripts", "publish-release.mjs"), ...args],
    {
      cwd: fixture.repository,
      encoding: "utf8",
      env: {
        ...process.env,
        QZSITE_PUBLISH_TEST_MODE: "1",
        QZSITE_PUBLISH_GITEE_URL: fixture.gitee,
        QZSITE_PUBLISH_GITHUB_URL: fixture.gitHub,
      },
    }
  )
}

test("release publishing updates Gitee before GitHub and verifies both remote heads", () => {
  const fixture = createFixture()
  try {
    const result = runPublisher(fixture)

    assert.equal(result.status, 0, result.stderr)
    assert.equal(remoteMain(fixture.repository, fixture.gitee), fixture.releaseSha)
    assert.equal(remoteMain(fixture.repository, fixture.gitHub), fixture.releaseSha)
    assert.ok(result.stdout.indexOf("pushing Gitee main first") >= 0)
    assert.ok(
      result.stdout.indexOf("pushing Gitee main first")
        < result.stdout.indexOf("synchronizing GitHub main")
    )
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test("release publishing refuses a mirror-synchronized Gitee head without touching GitHub", () => {
  const fixture = createFixture()
  try {
    git(fixture.repository, ["push", fixture.gitee, "HEAD:refs/heads/main"])
    const result = runPublisher(fixture)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /cannot create the required PushEvent/)
    assert.equal(remoteMain(fixture.repository, fixture.gitee), fixture.releaseSha)
    assert.equal(remoteMain(fixture.repository, fixture.gitHub), fixture.baseline)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test("GitHub-only recovery completes a partial sync without claiming a Gitee ref update", () => {
  const fixture = createFixture()
  try {
    git(fixture.repository, ["push", fixture.gitee, "HEAD:refs/heads/main"])
    const result = runPublisher(fixture, ["--sync-github-only"])

    assert.equal(result.status, 0, result.stderr)
    assert.equal(remoteMain(fixture.repository, fixture.gitee), fixture.releaseSha)
    assert.equal(remoteMain(fixture.repository, fixture.gitHub), fixture.releaseSha)
    assert.match(result.stdout, /GITEE_REF_UPDATED=false/)
    assert.match(result.stdout, /pipeline status remains unverified/)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})

test("release publishing rejects an untracked file before either remote is changed", () => {
  const fixture = createFixture()
  try {
    writeFileSync(path.join(fixture.repository, "untracked.txt"), "not releasable\n")
    const result = runPublisher(fixture)

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /clean working tree/)
    assert.equal(remoteMain(fixture.repository, fixture.gitee), fixture.baseline)
    assert.equal(remoteMain(fixture.repository, fixture.gitHub), fixture.baseline)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})
