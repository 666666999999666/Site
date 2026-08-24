export const DEFAULT_OG_IMAGE = {
  path: "/og-default.png",
  width: 1200,
  height: 630,
  alt: "QZ Site：Agent 应用、Python 与 Web 工程实践",
} as const

export function articleOpenGraphImage(title: string, coverImage: string | null) {
  if (coverImage) {
    return { path: coverImage, alt: `${title} 文章封面` }
  }
  return DEFAULT_OG_IMAGE
}
