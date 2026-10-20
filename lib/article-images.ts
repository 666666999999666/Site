import { readFile, stat } from 'node:fs/promises'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { normalizeContent } from './content'
import { uploadFilePath } from './uploads'
import { parseImageManifest, type ResponsiveImage } from './responsive-image'

/** Read only validated metadata for images actually referenced by this article. */
export async function getArticleImageMetadata(content: string): Promise<Record<string, ResponsiveImage>> {
  const urls = new Set<string>()
  const definitions = new Map<string, string>()
  const references = new Set<string>()
  type Node = { type: string; url?: string; identifier?: string; children?: Node[] }
  const visit = (node: Node) => {
    if (node.type === 'image' && node.url) urls.add(node.url)
    if (node.type === 'imageReference' && node.identifier) references.add(node.identifier.toLowerCase())
    if (node.type === 'definition' && node.identifier && node.url) definitions.set(node.identifier.toLowerCase(), node.url)
    node.children?.forEach(visit)
  }
  visit(fromMarkdown(normalizeContent(content)) as Node)
  for (const reference of references) { const url = definitions.get(reference); if (url) urls.add(url) }
  const results = await Promise.all([...urls].slice(0, 100).map(async (url) => {
    const source = uploadFilePath(url)
    if (!source) return null
    try {
      const [sourceInfo, manifestInfo] = await Promise.all([stat(source), stat(`${source}.qz-image.json`)])
      if (!sourceInfo.isFile() || !manifestInfo.isFile() || manifestInfo.size > 16_384) return null
      const manifest = parseImageManifest(JSON.parse(await readFile(`${source}.qz-image.json`, 'utf8')), url.slice('/uploads/'.length))
      if (!manifest || manifest.sourceBytes !== sourceInfo.size) return null
      for (const variant of manifest.variants) {
        const file = uploadFilePath(variant.url)
        if (!file) return null
        const info = await stat(file)
        if (!info.isFile() || info.size !== variant.bytes) return null
      }
      return [url, manifest] as const
    } catch { return null }
  }))
  return Object.fromEntries(results.filter((entry) => entry !== null))
}
