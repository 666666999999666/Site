/** Finite static variants shared by uploads, reviewed imports and the reader. */
export const RESPONSIVE_IMAGE_WIDTHS = [640, 960, 1440, 1920] as const
export const SAFE_IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif)$/i

export interface ResponsiveImage {
  width: number
  height: number
  sourceBytes: number
  variants: { url: string; width: number; height: number; bytes: number; sha256?: string }[]
}

export interface ImageVariantManifest extends ResponsiveImage {
  version: 1
  original: string
  sha256: string
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/

export function imageDerivativeNames(filename: string): string[] {
  if (!SAFE_IMAGE_NAME.test(filename) || filename.includes('.qz-')) return []
  return [`${filename}.qz-image.json`, ...RESPONSIVE_IMAGE_WIDTHS.map((width) => `${filename}.qz-${width}.webp`)]
}

export function parseImageManifest(value: unknown, filename: string): ResponsiveImage | null {
  if (!SAFE_IMAGE_NAME.test(filename) || filename.includes('.qz-') || !value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const dimension = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 100_000
  if (data.version !== 1 || data.original !== filename || !dimension(data.width) || !dimension(data.height) ||
      !Number.isSafeInteger(data.sourceBytes) || (data.sourceBytes as number) <= 0 || !Array.isArray(data.variants) ||
      (data.sha256 !== undefined && (typeof data.sha256 !== 'string' || !SHA256_PATTERN.test(data.sha256)))) return null
  const widths = new Set<number>()
  const variants: ResponsiveImage['variants'] = []
  for (const entry of data.variants) {
    if (!entry || typeof entry !== 'object') return null
    const item = entry as Record<string, unknown>
    if (!dimension(item.width) || !dimension(item.height) || !Number.isSafeInteger(item.bytes) || (item.bytes as number) <= 0 ||
        (item.sha256 !== undefined && (typeof item.sha256 !== 'string' || !SHA256_PATTERN.test(item.sha256)))) return null
    const width = item.width as number
    if (!RESPONSIVE_IMAGE_WIDTHS.some((candidate) => candidate === width) || width > (data.width as number) || widths.has(width)) return null
    if (Math.abs((item.height as number) - (data.height as number) * width / (data.width as number)) > 1) return null
    if (item.url !== `/uploads/${filename}.qz-${width}.webp`) return null
    widths.add(width)
    variants.push({ url: item.url, width, height: item.height as number, bytes: item.bytes as number,
      ...(typeof item.sha256 === 'string' ? { sha256: item.sha256 } : {}) })
  }
  return { width: data.width as number, height: data.height as number, sourceBytes: data.sourceBytes as number, variants: variants.sort((a, b) => a.width - b.width) }
}

/** Stored sets require a source digest; legacy v1 variant digests are optional. */
export function parseImageVariantManifest(value: unknown, filename: string): ImageVariantManifest | null {
  const metadata = parseImageManifest(value, filename)
  const sha256 = (value as Record<string, unknown> | null)?.sha256
  if (!metadata || typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) return null
  return { version: 1, original: filename, sha256, ...metadata }
}
