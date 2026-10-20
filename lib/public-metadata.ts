import type { Metadata } from "next"

interface PublicPageMetadataInput {
  title: string
  description: string
  pathname: string
  openGraph?: Metadata["openGraph"]
}

/** Child alternates replace layout alternates, so every public page repeats RSS discovery. */
export function publicPageMetadata({
  title,
  description,
  pathname,
  openGraph,
}: PublicPageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      types: { "application/rss+xml": "/feed.xml" },
      canonical: pathname,
    },
    openGraph: {
      title,
      description,
      url: pathname,
      locale: "zh_CN",
      ...openGraph,
    },
  }
}
