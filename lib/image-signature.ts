// Shared by browser and server: determine the image format from file bytes,
// because pasted images can have an empty or generic MIME type.
export function detectImageExtension(bytes: Uint8Array): "jpg" | "png" | "gif" | "webp" | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte)

  if (startsWith([0xff, 0xd8, 0xff])) return "jpg"
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png"
  if (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "gif"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp"
  return null
}
