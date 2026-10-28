import { createHash } from "node:crypto"

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  }
  return value
}

/** Retry identity must not silently accept an edited proposal. */
export function ideaConversionDigest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex")
}
