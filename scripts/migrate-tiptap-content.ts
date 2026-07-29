import "dotenv/config"
import { createHash } from "crypto"
import { Client } from "pg"
import {
  extractPlainText,
  extractTiptapPlainText,
  isTiptapJson,
  tiptapToMarkdown,
} from "../lib/content"

interface PostRow {
  id: string
  slug: string
  content: string
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")

  const apply = process.argv.includes("--apply")
  if (apply && process.env.CONTENT_MIGRATION_BACKUP_CONFIRMED !== "1") {
    throw new Error(
      "Refusing to update content without CONTENT_MIGRATION_BACKUP_CONFIRMED=1"
    )
  }

  const client = new Client({ connectionString })
  await client.connect()

  try {
    if (apply) await client.query("BEGIN")
    const result = await client.query<PostRow>(
      `SELECT "id", "slug", "content"
       FROM "Post"
       ORDER BY "createdAt" ASC${apply ? " FOR UPDATE" : ""}`
    )

    const legacy = result.rows.filter((post) => isTiptapJson(post.content))
    console.log(`Found ${legacy.length} Tiptap JSON post(s); mode=${apply ? "apply" : "dry-run"}`)

    for (const post of legacy) {
      const markdown = tiptapToMarkdown(post.content)
      const sourceText = (extractTiptapPlainText(post.content) ?? "")
        .replace(/\s+/g, "")
      const convertedText = extractPlainText(markdown).replace(/\s+/g, "")
      if (sourceText && !convertedText.includes(sourceText)) {
        throw new Error(`Conversion lost text for post ${post.id}`)
      }

      console.log(
        `${post.id} ${post.slug} ${sha256(post.content)} -> ${sha256(markdown)}`
      )

      if (apply) {
        const update = await client.query(
          `UPDATE "Post"
           SET "content" = $1, "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $2 AND "content" = $3`,
          [markdown, post.id, post.content]
        )
        if (update.rowCount !== 1) {
          throw new Error(`Post ${post.id} changed while migration was running`)
        }
      }
    }

    if (apply) await client.query("COMMIT")
    console.log(apply ? "Content migration committed" : "Dry-run completed without writes")
  } catch (error) {
    if (apply) await client.query("ROLLBACK")
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
