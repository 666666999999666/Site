import { fromMarkdown } from "mdast-util-from-markdown"
import { detectImageExtension } from "./image-signature"

interface MarkdownNode {
  type?: string
  url?: string
  identifier?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function embeddedImageFile(source: string): File {
  const match = /^data:([^,]*;base64),([a-z\d+/=]+)$/i.exec(source)
  if (!match) throw new Error("内嵌图片格式无效，请使用 JPG、PNG、GIF 或 WebP 图片")
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0
  if (Math.floor(match[2].length * 3 / 4) - padding > MAX_IMAGE_BYTES) {
    throw new Error("图片过大（限 5MB），请压缩后重新插入")
  }
  let decoded: string
  try { decoded = atob(match[2]) } catch { throw new Error("内嵌图片编码无效，请重新插入图片") }
  if (!decoded.length) throw new Error("图片为空")
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  const extension = detectImageExtension(bytes)
  if (!extension) throw new Error("内嵌图片格式无效，请使用 JPG、PNG、GIF 或 WebP 图片")
  const type = extension === "jpg" ? "image/jpeg" : `image/${extension}`
  return new File([bytes], `embedded-image.${extension}`, { type })
}

// HTML paste can preserve an image's entire data URL in Markdown. Upload only
// parsed image destinations; keep prose, code samples and ordinary links intact.
export async function uploadEmbeddedPostImages(
  markdown: string,
  upload: (file: File) => Promise<string>,
  uploaded = new Map<string, string>()
): Promise<string> {
  if (!/data:/i.test(markdown)) return markdown
  const direct: MarkdownNode[] = []
  const definitions = new Map<string, MarkdownNode>()
  const referenced = new Set<string>()
  const visit = (node: MarkdownNode) => {
    if (node.type === "image") direct.push(node)
    if (node.type === "imageReference" && node.identifier) referenced.add(node.identifier.toLowerCase())
    if (node.type === "definition" && node.identifier) definitions.set(node.identifier.toLowerCase(), node)
    node.children?.forEach(visit)
  }
  visit(fromMarkdown(markdown) as MarkdownNode)
  const images = [...direct, ...[...referenced].flatMap((key) => definitions.get(key) ?? [])]
    .filter((node) => node.url && /^data:/i.test(node.url))
  const edits = images.map((node) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined || !node.url) throw new Error("无法定位内嵌图片")
    const segment = markdown.slice(start, end)
    const marker = node.type === "image" ? "](" : "]:"
    const destination = segment.indexOf(marker)
    const offset = destination < 0 ? -1 : segment.indexOf(node.url, destination + marker.length)
    if (offset < 0) throw new Error("无法转换内嵌图片，请重新插入图片")
    return { source: node.url, start: start + offset, end: start + offset + node.url.length }
  })
  const files = new Map(edits.filter((edit) => !uploaded.has(edit.source))
    .map((edit) => [edit.source, embeddedImageFile(edit.source)]))
  for (const [source, file] of files) {
    const url = await upload(file)
    if (!/^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(url)) throw new Error("图片上传未返回有效地址")
    uploaded.set(source, url)
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    markdown = markdown.slice(0, edit.start) + uploaded.get(edit.source) + markdown.slice(edit.end)
  }
  return markdown
}
