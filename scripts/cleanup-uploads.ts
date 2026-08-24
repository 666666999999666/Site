import "dotenv/config"
import { readdir, stat, unlink } from "fs/promises"
import path from "path"
import { Client } from "pg"
import {
  collectReferencedUploadNames,
  type UploadCoverRow,
  type UploadPostRow,
} from "./upload-references"

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")

  const apply = process.argv.includes("--apply")
  if (apply && process.env.UPLOAD_CLEANUP_CONFIRMED !== "1") {
    throw new Error("Refusing to delete files without UPLOAD_CLEANUP_CONFIRMED=1")
  }

  const uploadDir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "public", "uploads")
  const graceHours = Number(process.env.UPLOAD_GRACE_HOURS ?? "24")
  if (!Number.isFinite(graceHours) || graceHours < 1) {
    throw new Error("UPLOAD_GRACE_HOURS must be at least 1")
  }

  const client = new Client({ connectionString })
  await client.connect()

  try {
    const [posts, projects, series] = await Promise.all([
      client.query<UploadPostRow>(`SELECT "content", "coverImage" FROM "Post"`),
      client.query<UploadCoverRow>(`SELECT "coverImage" FROM "Project"`),
      client.query<UploadCoverRow>(`SELECT "coverImage" FROM "Series"`),
    ])

    const referenced = collectReferencedUploadNames(posts.rows, projects.rows, series.rows)

    const cutoff = Date.now() - graceHours * 60 * 60 * 1000
    const files = await readdir(uploadDir, { withFileTypes: true })
    const orphaned: string[] = []

    for (const entry of files) {
      if (!entry.isFile() || entry.name === ".gitkeep" || referenced.has(entry.name)) continue
      const filePath = path.join(uploadDir, entry.name)
      const info = await stat(filePath)
      if (info.mtimeMs < cutoff) orphaned.push(entry.name)
    }

    console.log(
      `Found ${orphaned.length} orphaned upload(s); mode=${apply ? "apply" : "dry-run"}`
    )
    for (const filename of orphaned) {
      console.log(filename)
      if (apply) await unlink(path.join(uploadDir, filename))
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
