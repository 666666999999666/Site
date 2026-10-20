import { readFile } from "node:fs/promises"
import { planTagNormalization, splitTagTokens } from "../lib/tags"

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || args[0].startsWith("--")) {
    throw new Error("Usage: node --import tsx scripts/plan-tag-normalization.ts <posts.json>. Read-only; no --apply mode.")
  }
  const input: unknown = JSON.parse(await readFile(args[0], "utf8"))
  if (!Array.isArray(input) || !input.every((post) => post && typeof post.id === "string" && typeof post.slug === "string" && Array.isArray(post.tags) && post.tags.every((tag: unknown) => typeof tag === "string"))) {
    throw new Error("Expected an array of { id, slug, tags: string[] } objects")
  }
  const changes = planTagNormalization(input)
  console.log(JSON.stringify({
    mode: "dry-run",
    writes: 0,
    postsChecked: input.length,
    affectedPosts: changes.length,
    policy: "Only trim, split comma/Chinese comma/enumeration comma, and deduplicate. No semantic aliases, category changes, or series assignment.",
    preservedCommaLabels: input.flatMap((post) => post.tags.filter((tag: string) => /[,，、]/u.test(tag) && splitTagTokens(tag).length === 1).map((tag: string) => ({ id: post.id, slug: post.slug, tag }))),
    reviewNote: "Review each changed label: if a separator is part of a literal unquoted name rather than a list, retain it explicitly before approving any migration.",
    changes,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
