import { createHash } from "node:crypto"
import { lstat, readdir, readFile, readlink } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(process.argv[2] || process.cwd())
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
  "docs",
  "node_modules",
  "playwright-report",
  "test-results",
])

function isIgnored(relativePath, directory) {
  const normalized = relativePath.replaceAll(path.sep, "/")
  const parts = normalized.split("/")
  const name = parts.at(-1) || ""

  if (parts.some((part) => ignoredDirectories.has(part) || part.startsWith(".next-"))) return true
  if (parts[0] === "nginx" && parts.length > 1 && parts[1] !== "conf.d") return true
  if (normalized.startsWith("lib/generated/prisma/")) return true
  if (parts[0] === "ops" && name.startsWith(".deploy-bootstrap-")) return true
  if (/^\.deploy-(state|pending|history)(?:\.|$)/.test(name) || name === ".source-fingerprint") {
    return true
  }
  if (name === "next-env.d.ts" || name.endsWith(".tsbuildinfo")) return true
  if (parts.length === 1 && name === "Dockerfile.release") return true
  if (name.endsWith(".md")) return true
  if (name.startsWith(".env") && name !== ".env.example") return true
  if (parts.length === 1 && /^docker-compose.+\.ya?ml$/.test(name)) return true
  if (
    parts[0] === "public"
    && parts[1] === "uploads"
    && name !== ".gitkeep"
  ) return true
  return directory && parts.length === 1 && ignoredDirectories.has(name)
}

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"))

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

const hash = createHash("sha256")
hash.update("qzsite-source-v1\0")

for (const relativePath of await collectFiles(root)) {
  const absolutePath = path.join(root, ...relativePath.split("/"))
  const stats = await lstat(absolutePath)
  hash.update(relativePath)
  hash.update("\0")
  hash.update(stats.isSymbolicLink() ? await readlink(absolutePath) : await readFile(absolutePath))
  hash.update("\0")
}

process.stdout.write(`${hash.digest("hex")}\n`)
