import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { lstat, readdir, readFile, readlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".superpowers",
  ".worktrees",
  ".tmp-pgtest",
  "backups",
  "coverage",
  "data",
  "drafts",
  "node_modules",
  "playwright-report",
  "test-results",
])

function isIgnored(relativePath, directory) {
  const normalized = relativePath.replace(/\\/g, "/")
  const parts = normalized.split("/")
  const name = parts[parts.length - 1] || ""
  const includedMarkdown = new Set([
    "README.md",
    "docs/operations.md",
    "docs/disaster-recovery.md",
  ])

  if (parts.some((part) => ignoredDirectories.has(part) || part.startsWith(".next-"))) return true
  if (
    parts[0] === "docs"
    && normalized !== "docs"
    && !includedMarkdown.has(normalized)
  ) return true
  if (
    parts[0] === "nginx"
    && !["nginx", "nginx/conf.d", "nginx/conf.d/default.conf"].includes(normalized)
  ) return true
  if (normalized.startsWith("lib/generated/prisma/")) return true
  if (parts[0] === "ops" && name.startsWith(".deploy-bootstrap-")) return true
  if (/^\.deploy-(state|pending|history)(?:\.|$)/.test(name) || name === ".source-fingerprint") {
    return true
  }
  if (name === "next-env.d.ts" || name.endsWith(".tsbuildinfo")) return true
  if (parts.length === 1 && ["Dockerfile.release", "source-manifest.json"].includes(name)) {
    return true
  }
  if (name.endsWith(".md") && !includedMarkdown.has(normalized)) return true
  if (name.startsWith(".env") && name !== ".env.example") return true
  if (
    parts.length === 1
    && /^docker-compose.*\.ya?ml$/.test(name)
    && name !== "docker-compose.yml"
  ) return true
  if (
    parts[0] === "public"
    && parts[1] === "uploads"
    && name !== ".gitkeep"
  ) return true
  return directory && parts.length === 1 && ignoredDirectories.has(name)
}

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)))

  const files = []
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (isIgnored(relativePath, entry.isDirectory())) continue

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativePath))
    } else {
      files.push(relativePath)
    }
  }
  return files
}

function requireSafeRelativePath(relativePath) {
  if (
    typeof relativePath !== "string"
    || relativePath.length === 0
    || relativePath.includes("\0")
    || relativePath.includes("\\")
    || path.posix.isAbsolute(relativePath)
    || path.posix.normalize(relativePath) !== relativePath
    || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe source manifest path: ${JSON.stringify(relativePath)}`)
  }
  return relativePath
}

async function payloadForPath(root, relativePath, expectedKind) {
  const absolutePath = path.join(root, ...relativePath.split("/"))
  const relativeToRoot = path.relative(root, absolutePath)
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Source manifest path escaped the root: ${relativePath}`)
  }
  const stats = await lstat(absolutePath)
  if (stats.isSymbolicLink()) {
    if (expectedKind && expectedKind !== "symlink") {
      throw new Error(`Source manifest kind mismatch: ${relativePath}`)
    }
    return { kind: "symlink", payload: Buffer.from(await readlink(absolutePath)) }
  }
  if (!stats.isFile()) throw new Error(`Source manifest entry is not a regular file: ${relativePath}`)
  if (expectedKind && expectedKind !== "file") {
    throw new Error(`Source manifest kind mismatch: ${relativePath}`)
  }
  return { kind: "file", payload: await readFile(absolutePath) }
}

async function writeGitManifest(releaseSha, outputPath) {
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
    throw new Error("manifest release SHA must be a full 40-character lowercase Git commit")
  }
  const repositoryRoot = process.cwd()
  const { stdout } = await execFileAsync(
    "git",
    ["ls-tree", "-rz", "--full-tree", releaseSha],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  )
  const records = stdout.toString("utf8").split("\0").filter(Boolean)
  const files = []

  for (const record of records) {
    const separator = record.indexOf("\t")
    if (separator < 0) throw new Error("Unexpected git ls-tree record")
    const [mode, type, objectId] = record.slice(0, separator).split(" ")
    const relativePath = requireSafeRelativePath(record.slice(separator + 1))
    if (type !== "blob" || isIgnored(relativePath, false)) continue
    const { stdout: blob } = await execFileAsync(
      "git",
      ["cat-file", "blob", objectId],
      { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
    )
    files.push({
      path: relativePath,
      kind: mode === "120000" ? "symlink" : "file",
      sha256: createHash("sha256").update(blob).digest("hex"),
    })
  }

  files.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)))
  await writeFile(
    path.resolve(outputPath),
    `${JSON.stringify({ schema_version: 1, release_sha: releaseSha, files })}\n`,
    { encoding: "utf8", mode: 0o600 }
  )
}

async function readManifest(manifestPath) {
  const parsed = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"))
  if (
    parsed?.schema_version !== 1
    || !/^[0-9a-f]{40}$/.test(parsed.release_sha)
    || !Array.isArray(parsed.files)
  ) {
    throw new Error("Source manifest is malformed")
  }
  const files = []
  let previousPath = ""
  for (const entry of parsed.files) {
    const relativePath = requireSafeRelativePath(entry?.path)
    if (
      !["file", "symlink"].includes(entry?.kind)
      || !/^[0-9a-f]{64}$/.test(entry?.sha256)
      || isIgnored(relativePath, false)
      || (previousPath && Buffer.from(previousPath).compare(Buffer.from(relativePath)) >= 0)
    ) {
      throw new Error(`Source manifest entry is malformed: ${relativePath}`)
    }
    previousPath = relativePath
    files.push({ path: relativePath, kind: entry.kind, sha256: entry.sha256 })
  }
  return { releaseSha: parsed.release_sha, files }
}

async function fingerprint(root, manifestPath, expectedReleaseSha) {
  const manifest = manifestPath ? await readManifest(manifestPath) : null
  if (expectedReleaseSha) {
    if (!/^[0-9a-f]{40}$/.test(expectedReleaseSha)) {
      throw new Error("expected release SHA must be a full 40-character lowercase Git commit")
    }
    if (!manifest || manifest.releaseSha !== expectedReleaseSha) {
      throw new Error("Source manifest release SHA does not match the expected release")
    }
  }
  if (manifest) {
    const expectedPaths = new Set(manifest.files.map((entry) => entry.path))
    const unexpectedPath = (await collectFiles(root)).find((relativePath) => (
      !expectedPaths.has(relativePath)
    ))
    if (unexpectedPath) {
      throw new Error(`Source tree contains a file outside the release manifest: ${unexpectedPath}`)
    }
  }
  const files = manifest ? manifest.files : (await collectFiles(root)).map((relativePath) => ({
    path: relativePath,
    kind: null,
    sha256: null,
  }))
  const hash = createHash("sha256")
  hash.update("qzsite-source-v1\0")

  for (const entry of files) {
    const { payload } = await payloadForPath(root, entry.path, entry.kind)
    if (entry.sha256) {
      const actualSha256 = createHash("sha256").update(payload).digest("hex")
      if (actualSha256 !== entry.sha256) {
        throw new Error(`Tracked source content does not match the release manifest: ${entry.path}`)
      }
    }
    hash.update(entry.path)
    hash.update("\0")
    hash.update(payload)
    hash.update("\0")
  }
  return { digest: hash.digest("hex"), releaseSha: manifest?.releaseSha ?? null }
}

if (process.argv[2] === "--git-manifest") {
  await writeGitManifest(process.argv[3] || "", process.argv[4] || "source-manifest.json")
} else {
  const root = path.resolve(process.argv[2] || process.cwd())
  const { digest } = await fingerprint(root, process.argv[3], process.argv[4])
  process.stdout.write(`${digest}\n`)
}
