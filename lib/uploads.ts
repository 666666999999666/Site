import path from "path"

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export function detectImageExtension(buffer: Buffer): "jpg" | "png" | "gif" | "webp" | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return "jpg"

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return "png"

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
  ) return "gif"

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "webp"

  return null
}

export function uploadFilePath(url: string): string | null {
  const match = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(url)
  if (!match) return null
  return path.join(process.cwd(), "public", "uploads", match[1])
}
