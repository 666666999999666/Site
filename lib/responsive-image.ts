/** Static variants are prepared offline; the production app never transcodes images. */
export const RESPONSIVE_IMAGE_WIDTHS = [640, 960, 1440, 1920] as const
export const SAFE_IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif)$/i

export interface ResponsiveImage {
  width: number
  height: number
  sourceBytes: number
  variants: { url: string; width: number; height: number; bytes: number }[]
}

export function imageDerivativeNames(filename: string): string[] {
  if (!SAFE_IMAGE_NAME.test(filename) || filename.includes('.qz-')) return []
  return [`${filename}.qz-image.json`, ...RESPONSIVE_IMAGE_WIDTHS.map((width) => `${filename}.qz-${width}.webp`)]
}

export function parseImageManifest(value: unknown, filename: string): ResponsiveImage | null {
  if (!SAFE_IMAGE_NAME.test(filename) || !value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const dimension = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 100_000
  if (data.version !== 1 || data.original !== filename || !dimension(data.width) || !dimension(data.height) ||
      typeof data.sourceBytes !== 'number' || data.sourceBytes <= 0 || !Array.isArray(data.variants)) return null
  const widths = new Set<number>()
  const variants: ResponsiveImage['variants'] = []
  for (const entry of data.variants) {
    if (!entry || typeof entry !== 'object') return null
    const item = entry as Record<string, unknown>
    if (!dimension(item.width) || !dimension(item.height) || typeof item.bytes !== 'number' || item.bytes <= 0) return null
    const width = item.width as number
    if (!RESPONSIVE_IMAGE_WIDTHS.some((candidate) => candidate === width) || width > (data.width as number) || widths.has(width)) return null
    if (Math.abs((item.height as number) - (data.height as number) * width / (data.width as number)) > 1) return null
    if (item.url !== `/uploads/${filename}.qz-${width}.webp`) return null
    widths.add(width)
    variants.push({ url: item.url, width, height: item.height as number, bytes: item.bytes })
  }
  return { width: data.width as number, height: data.height as number, sourceBytes: data.sourceBytes, variants: variants.sort((a, b) => a.width - b.width) }
}
