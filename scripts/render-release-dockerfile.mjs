import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const releaseSha = process.argv[2] || ""
const outputPath = path.resolve(process.argv[3] || "Dockerfile.release")

if (!/^[0-9a-f]{40}$/.test(releaseSha)) {
  throw new Error("release SHA must be a full 40-character lowercase Git commit")
}

const sourcePath = path.resolve("Dockerfile")
const source = await readFile(sourcePath, "utf8")
const marker = "ARG APP_RELEASE_SHA\n"
const occurrences = source.split(marker).length - 1

if (occurrences !== 1) {
  throw new Error(`Dockerfile must contain exactly one ${marker.trim()} marker`)
}

const rendered = source.replace(marker, `ARG APP_RELEASE_SHA=${releaseSha}\n`)
await writeFile(outputPath, rendered, { encoding: "utf8", mode: 0o600 })
