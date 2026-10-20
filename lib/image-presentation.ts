/** Display width is presentation metadata, never the image's intrinsic size or alt text. */
export function normalizeImageWidth(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined
  if (typeof value === "string" && !/^\d+$/.test(value)) return undefined
  const width = Number(value)
  return Number.isInteger(width) && width > 0 && width <= 10_000 ? width : undefined
}

/** Keep images valid CommonMark, including their original URL, alt and visible title. */
export function decodeImageTitle(value: string | null | undefined): {
  title: string | undefined
  width: number | undefined
} {
  if (!value) return { title: value ?? undefined, width: undefined }
  const match = /(?:^| )\{qz-width=(\d+)\}$/.exec(value)
  const width = normalizeImageWidth(match?.[1])
  if (!match || width === undefined) return { title: value, width: undefined }
  return { title: value.slice(0, match.index) || undefined, width }
}

export function encodeImageTitle(title: string | null | undefined, value: unknown): string | null {
  const width = normalizeImageWidth(value)
  if (width === undefined) return title ?? null
  return `${title ? `${title} ` : ""}{qz-width=${width}}`
}
