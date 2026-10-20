/** Read-only, file-input publication review. This script never loads a database or writes files. */
import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import { getPostSummary, getReadingLabel, scanPublicationContent, type PublicationContent } from "../lib/publication-content"

function asPost(value: unknown, source: string): PublicationContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${source}: expected a post object`)
  const post = value as Record<string, unknown>
  if (typeof post.content !== "string") throw new Error(`${source}: content must be a string`)
  for (const field of ["title", "excerpt", "contentFormat", "readHint"]) {
    if (post[field] !== undefined && post[field] !== null && typeof post[field] !== "string") {
      throw new Error(`${source}: ${field} must be a string or null`)
    }
  }
  return { title: post.title as string | undefined, excerpt: post.excerpt as string | null | undefined,
    content: post.content, contentFormat: post.contentFormat as string | null | undefined,
    readHint: post.readHint as string | null | undefined,
    readTime: typeof post.readTime === "number" ? post.readTime : undefined }
}

async function main() {
  const files = process.argv.slice(2)
  if (!files.length || files.includes("--help")) {
    process.stdout.write("Read-only review: npx tsx scripts/check-publication-content.ts <article.md | posts.json> [...]\nJSON input: a post object or an array of posts with content, optional title/excerpt. No database access or writes.\n")
    return
  }
  if (files.some((file) => file.startsWith("-"))) throw new Error("Only local input files are accepted; no apply/write mode exists")
  const reports = []
  for (const file of files) {
    const raw = await readFile(file, "utf8")
    const values = extname(file).toLowerCase() === ".json" ? JSON.parse(raw) as unknown : { title: basename(file), content: raw }
    const posts = Array.isArray(values) ? values : [values]
    for (let index = 0; index < posts.length; index += 1) {
      const post = asPost(posts[index], file)
      reports.push({ source: file, index, title: post.title ?? null, summary: getPostSummary(post),
        readingLabel: getReadingLabel(post), ...scanPublicationContent(post) })
    }
  }
  process.stdout.write(JSON.stringify({ mode: "dry-run", writes: 0, reports }, null, 2) + "\n")
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Publication scan failed"}\n`)
  process.exitCode = 1
})
