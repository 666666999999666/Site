import "dotenv/config"
import { readdir, stat, unlink } from "fs/promises"
import path from "path"
import { Client } from "pg"
import {
  collectReferencedUploadNames,
  type UploadCoverRow,
  type UploadPostRow,
} from "./upload-references"

const SAFE_UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

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
    // node-postgres deprecates issuing overlapping queries on one Client.
    // Keep these reads serial so cleanup stays compatible with future releases.
    const posts = await client.query<UploadPostRow>(
      `SELECT "content", "coverImage" FROM "Post"`
    )
    const projects = await client.query<UploadCoverRow>(
      `SELECT "coverImage" FROM "Project"`
    )
    const series = await client.query<UploadCoverRow>(
      `SELECT "coverImage" FROM "Series"`
    )

    const referenced = collectReferencedUploadNames(posts.rows, projects.rows, series.rows)

    const cutoff = Date.now() - graceHours * 60 * 60 * 1000
    const files = await readdir(uploadDir, { withFileTypes: true })
    const orphaned: string[] = []

    for (const entry of files) {
      if (!entry.isFile() || entry.name === ".gitkeep" || referenced.has(entry.name)) continue
      if (!SAFE_UPLOAD_NAME.test(entry.name)) {
        throw new Error(`Refusing to inspect an unsafe upload filename: ${entry.name}`)
      }
      const filePath = path.join(uploadDir, entry.name)
      const info = await stat(filePath)
      if (info.mtimeMs < cutoff) orphaned.push(entry.name)
    }

    console.log(
      `Found ${orphaned.length} orphaned upload(s); mode=${apply ? "apply" : "dry-run"}`
    )
    let orphanBytes = 0
    for (const filename of orphaned) {
      console.log(filename)
      const info = await stat(path.join(uploadDir, filename))
      orphanBytes += info.size
      if (apply) await unlink(path.join(uploadDir, filename))
    }
    console.log(`orphanUploads=${orphaned.length} orphanUploadBytes=${orphanBytes}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
