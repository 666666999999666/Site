#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const productionGiteeUrl = "https://gitee.com/lqzzql/Site.git"
const productionGitHubUrl = "https://github.com/666666999999666/Site.git"
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function captureGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  } catch (error) {
    const stderr = error?.stderr?.toString().trim()
    throw new Error(stderr || `git ${args[0]} failed`)
  }
}

function pushMain(url, releaseSha, { requireUpdate }) {
  const result = spawnSync(
    "git",
    ["push", "--porcelain", url, `${releaseSha}:refs/heads/main`],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git push failed with exit code ${result.status}`)

  const statusLines = result.stdout
    .split(/\r?\n/)
    .filter((line) => /^[ =*+\-!]\t/.test(line))
  if (statusLines.length !== 1) throw new Error("git push returned an unexpected porcelain result")

  const flag = statusLines[0][0]
  if (requireUpdate && flag === "=") {
    throw new Error("Gitee push was up to date, so no PushEvent-producing ref update occurred")
  }
  if (flag !== " " && flag !== "=") {
    throw new Error(`git push returned an unsafe porcelain status: ${flag}`)
  }

  return flag === " "
}

function readRemoteMain(url, label) {
  const output = captureGit(["ls-remote", url, "refs/heads/main"])
  const match = output.match(/^([0-9a-f]{40})\s+refs\/heads\/main$/)
  if (!match) throw new Error(`${label} main is missing or malformed`)
  return match[1]
}

function requireFastForward(remoteSha, localSha, label) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", remoteSha, localSha],
    { cwd: repositoryRoot, stdio: "ignore" }
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} main cannot be fast-forwarded to local HEAD`)
  }
}

function resolveRemoteUrls() {
  const testMode = process.env.QZSITE_PUBLISH_TEST_MODE === "1"
  const testGiteeUrl = process.env.QZSITE_PUBLISH_GITEE_URL
  const testGitHubUrl = process.env.QZSITE_PUBLISH_GITHUB_URL

  if (!testMode && (testGiteeUrl || testGitHubUrl)) {
    throw new Error("test remote overrides require QZSITE_PUBLISH_TEST_MODE=1")
  }
  if (testMode && (!testGiteeUrl || !testGitHubUrl)) {
    throw new Error("test mode requires both test remote URLs")
  }

  return {
    giteeUrl: testMode ? testGiteeUrl : productionGiteeUrl,
    gitHubUrl: testMode ? testGitHubUrl : productionGitHubUrl,
  }
}

function assertLocalReleaseState() {
  const branch = captureGit(["branch", "--show-current"])
  if (branch !== "main") throw new Error("release publishing requires the local main branch")

  const dirty = captureGit(["status", "--porcelain=v1", "--untracked-files=all"])
  if (dirty) throw new Error("release publishing requires a clean working tree")

  const releaseSha = captureGit(["rev-parse", "HEAD"])
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error("local HEAD is not a full Git SHA")
  return releaseSha
}

function main() {
  const { giteeUrl, gitHubUrl } = resolveRemoteUrls()
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== "--sync-github-only")) {
    throw new Error("usage: npm run release:publish -- [--sync-github-only]")
  }
  const syncGitHubOnly = args[0] === "--sync-github-only"
  const releaseSha = assertLocalReleaseState()

  const giteeBefore = readRemoteMain(giteeUrl, "Gitee")
  const gitHubBefore = readRemoteMain(gitHubUrl, "GitHub")
  requireFastForward(giteeBefore, releaseSha, "Gitee")
  requireFastForward(gitHubBefore, releaseSha, "GitHub")

  if (syncGitHubOnly) {
    if (giteeBefore !== releaseSha) {
      throw new Error("GitHub-only recovery requires Gitee main to equal local HEAD")
    }
    if (gitHubBefore !== releaseSha) {
      console.log(`[publish-release] synchronizing GitHub main only: ${releaseSha}`)
      pushMain(gitHubUrl, releaseSha, { requireUpdate: false })
      if (readRemoteMain(gitHubUrl, "GitHub") !== releaseSha) {
        throw new Error("GitHub main verification failed")
      }
    }
    console.log("[publish-release] GITEE_REF_UPDATED=false")
    console.log(`[publish-release] both remotes verified: ${releaseSha}`)
    console.log("[publish-release] pipeline status remains unverified")
    return
  }

  if (giteeBefore === releaseSha) {
    throw new Error(
      "Gitee main already equals local HEAD, so this run cannot create the required PushEvent"
    )
  }

  if (assertLocalReleaseState() !== releaseSha) {
    throw new Error("local HEAD changed after remote preflight")
  }

  let giteeRefUpdated = false
  console.log(`[publish-release] pushing Gitee main first: ${releaseSha}`)
  try {
    giteeRefUpdated = pushMain(giteeUrl, releaseSha, { requireUpdate: true })
    const giteeAfter = readRemoteMain(giteeUrl, "Gitee")
    if (giteeAfter !== releaseSha) throw new Error("Gitee main verification failed")

    if (gitHubBefore !== releaseSha) {
      console.log(`[publish-release] synchronizing GitHub main: ${releaseSha}`)
      pushMain(gitHubUrl, releaseSha, { requireUpdate: false })
    }
    const gitHubAfter = readRemoteMain(gitHubUrl, "GitHub")
    if (gitHubAfter !== releaseSha) throw new Error("GitHub main verification failed")
  } catch (error) {
    if (giteeRefUpdated) {
      throw new Error(
        `Gitee main was updated, but final synchronization failed; do not roll it back. `
        + `Repair with --sync-github-only. Cause: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    throw error
  }

  console.log("[publish-release] GITEE_REF_UPDATED=true")
  console.log(`[publish-release] both remotes verified: ${releaseSha}`)
  console.log("[publish-release] pipeline status remains unverified")
}

try {
  main()
} catch (error) {
  console.error(`[publish-release] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
