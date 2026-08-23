import "dotenv/config"
import { lstat, readdir, unlink } from "fs/promises"
import path from "path"
import { Client } from "pg"

const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.(?:jpg|png|gif|webp)$/
const DATABASE_SCHEMA_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

interface ImageRow {
  id: string
  storageKey: string
}

interface StorageFile {
  name: string
  mtimeMs: number
}

interface CountRow {
  count: number
}

function databaseConnection(connectionString: string): {
  connectionString: string
  schema: string
} {
  const url = new URL(connectionString)
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres or postgresql")
  }

  const schema = url.searchParams.get("schema") ?? "public"
  if (!DATABASE_SCHEMA_PATTERN.test(schema)) {
    throw new Error("DATABASE_URL schema is invalid")
  }

  // `schema` is a Prisma URL option rather than a PostgreSQL connection option.
  url.searchParams.delete("schema")
  return { connectionString: url.toString(), schema }
}

function isSafeStorageKey(value: string): boolean {
  return STORAGE_KEY_PATTERN.test(value)
}

async function listStorageFiles(directory: string): Promise<StorageFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: StorageFile[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !isSafeStorageKey(entry.name)) continue
    const info = await lstat(path.join(directory, entry.name))
    if (info.isFile() && !info.isSymbolicLink()) {
      files.push({ name: entry.name, mtimeMs: info.mtimeMs })
    }
  }

  return files
}

async function removeFile(directory: string, storageKey: string): Promise<void> {
  if (!isSafeStorageKey(storageKey)) {
    throw new Error(`Refusing to remove unsafe storage key: ${storageKey}`)
  }

  try {
    await unlink(path.join(directory, storageKey))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")

  const apply = process.argv.includes("--apply")
  if (apply && process.env.STUDY_UPLOAD_CLEANUP_CONFIRMED !== "1") {
    throw new Error(
      "Refusing to delete study uploads without STUDY_UPLOAD_CLEANUP_CONFIRMED=1"
    )
  }

  const uploadDir = process.env.STUDY_UPLOAD_DIR
    ? path.resolve(process.env.STUDY_UPLOAD_DIR)
    : path.join(process.cwd(), "data", "study-uploads")
  const graceHours = Number(process.env.STUDY_UPLOAD_GRACE_HOURS ?? "24")
  if (!Number.isFinite(graceHours) || graceHours < 1) {
    throw new Error("STUDY_UPLOAD_GRACE_HOURS must be at least 1")
  }

  const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000)
  const database = databaseConnection(connectionString)
  const client = new Client({ connectionString: database.connectionString })
  await client.connect()

  try {
    // Parameterizing set_config keeps the selected schema out of SQL text. The
    // quotes preserve legal mixed-case schema names after the strict validation
    // above.
    await client.query("SELECT set_config('search_path', $1, false)", [
      `"${database.schema}"`,
    ])

    const expiredReviewTickets = await client.query<CountRow>(`
      SELECT COUNT(*)::integer AS "count"
      FROM "QuestionReviewTicket"
      WHERE "expiresAt" <= NOW()
        AND "cancelledAt" IS NULL
        AND "consumedAt" IS NULL
    `)
    const repairCandidates = await client.query<ImageRow>(`
      SELECT qi."id", qi."storageKey"
      FROM "QuestionImage" qi
      WHERE qi."unreferencedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "QuestionImageReference" ref
          WHERE ref."imageId" = qi."id"
        )
      ORDER BY qi."createdAt", qi."id"
    `)
    const dueImages = await client.query<ImageRow>(
      `
        SELECT qi."id", qi."storageKey"
        FROM "QuestionImage" qi
        WHERE qi."unreferencedAt" <= $1
          AND NOT EXISTS (
            SELECT 1 FROM "QuestionImageReference" ref
            WHERE ref."imageId" = qi."id"
          )
        ORDER BY qi."unreferencedAt", qi."id"
      `,
      [cutoff]
    )
    const databaseImages = await client.query<ImageRow>(`
      SELECT "id", "storageKey" FROM "QuestionImage" ORDER BY "id"
    `)
    const storageFiles = await listStorageFiles(uploadDir)

    for (const image of databaseImages.rows) {
      if (!isSafeStorageKey(image.storageKey)) {
        throw new Error(`Unsafe storage key found in database: ${image.storageKey}`)
      }
    }

    const databaseKeys = new Set(databaseImages.rows.map((row) => row.storageKey))
    const oldFilesWithoutRow = storageFiles.filter(
      (file) => !databaseKeys.has(file.name) && file.mtimeMs <= cutoff.getTime()
    )

    console.log(
      [
        `mode=${apply ? "apply" : "dry-run"}`,
        `graceHours=${graceHours}`,
        `expiredReviewTickets=${expiredReviewTickets.rows[0]?.count ?? 0}`,
        `repairCandidates=${repairCandidates.rowCount ?? 0}`,
        `dueImageRows=${dueImages.rowCount ?? 0}`,
        `oldFilesWithoutRow=${oldFilesWithoutRow.length}`,
      ].join(" ")
    )
    for (const row of repairCandidates.rows) {
      console.log(`repair-unreferencedAt ${row.storageKey}`)
    }
    for (const row of dueImages.rows) console.log(`delete-image ${row.storageKey}`)
    for (const file of oldFilesWithoutRow) console.log(`delete-file ${file.name}`)

    if (!apply) return

    let deletedImages: ImageRow[] = []
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    try {
      const cancelledTickets = await client.query(`
        UPDATE "QuestionReviewTicket"
        SET "cancelledAt" = NOW(),
            "answerDigest" = NULL,
            "updatedAt" = NOW()
        WHERE "expiresAt" <= NOW()
          AND "cancelledAt" IS NULL
          AND "consumedAt" IS NULL
      `)

      const repaired = await client.query<ImageRow>(`
        UPDATE "QuestionImage" qi
        SET "unreferencedAt" = GREATEST(NOW(), qi."createdAt")
        WHERE qi."unreferencedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "QuestionImageReference" ref
            WHERE ref."imageId" = qi."id"
          )
        RETURNING qi."id", qi."storageKey"
      `)

      const deleted = await client.query<ImageRow>(
        `
          WITH candidates AS (
            SELECT qi."id"
            FROM "QuestionImage" qi
            WHERE qi."unreferencedAt" <= $1
              AND NOT EXISTS (
                SELECT 1 FROM "QuestionImageReference" ref
                WHERE ref."imageId" = qi."id"
              )
            FOR UPDATE
          )
          DELETE FROM "QuestionImage" qi
          USING candidates
          WHERE qi."id" = candidates."id"
          RETURNING qi."id", qi."storageKey"
        `,
        [cutoff]
      )

      for (const row of [...repaired.rows, ...deleted.rows]) {
        if (!isSafeStorageKey(row.storageKey)) {
          throw new Error(`Unsafe storage key found in database: ${row.storageKey}`)
        }
      }

      deletedImages = deleted.rows
      await client.query("COMMIT")
      console.log(
        [
          `cancelledReviewTickets=${cancelledTickets.rowCount ?? 0}`,
          `repaired=${repaired.rowCount ?? 0}`,
          `deletedImageRows=${deleted.rowCount ?? 0}`,
        ].join(" ")
      )
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }

    for (const image of deletedImages) {
      await removeFile(uploadDir, image.storageKey)
    }

    const remainingImages = await client.query<ImageRow>(`
      SELECT "id", "storageKey" FROM "QuestionImage" ORDER BY "id"
    `)
    for (const image of remainingImages.rows) {
      if (!isSafeStorageKey(image.storageKey)) {
        throw new Error(`Unsafe storage key found in database: ${image.storageKey}`)
      }
    }
    const remainingKeys = new Set(remainingImages.rows.map((row) => row.storageKey))
    const currentFiles = await listStorageFiles(uploadDir)
    let deletedFilesWithoutRow = 0
    for (const file of currentFiles) {
      if (remainingKeys.has(file.name) || file.mtimeMs > cutoff.getTime()) continue
      await removeFile(uploadDir, file.name)
      deletedFilesWithoutRow += 1
    }

    console.log(
      `deletedImageFiles=${deletedImages.length} deletedFilesWithoutRow=${deletedFilesWithoutRow}`
    )
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
