const FALLBACK_SITE_URL = "http://localhost:3000"

export function getSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL
  try {
    return new URL(configured)
  } catch {
    return new URL(FALLBACK_SITE_URL)
  }
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, getSiteUrl()).toString()
}
