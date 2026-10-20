import path from "path"
import { extractUploadUrls } from "../lib/content"
import { imageDerivativeNames } from "../lib/responsive-image"

export interface UploadPostRow {
  content: string
  coverImage: string | null
}

export interface UploadCoverRow {
  coverImage: string | null
}

export function collectReferencedUploadNames(
  posts: UploadPostRow[],
  projects: UploadCoverRow[],
  series: UploadCoverRow[]
): Set<string> {
  const referenced = new Set<string>()
  for (const post of posts) {
    for (const url of extractUploadUrls(post.content)) referenced.add(path.basename(url))
    if (post.coverImage) referenced.add(path.basename(post.coverImage))
  }
  for (const item of [...projects, ...series]) {
    if (item.coverImage) referenced.add(path.basename(item.coverImage))
  }
  for (const filename of [...referenced]) {
    for (const derivative of imageDerivativeNames(filename)) referenced.add(derivative)
  }
  return referenced
}
