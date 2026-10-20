import { readFileSync } from "node:fs"
import { Script } from "node:vm"
import ts from "typescript"
import type { Metadata } from "next"
import { publicPageMetadata } from "../../lib/public-metadata"
import { absoluteUrl } from "../../lib/site"
import { decodeRouteSegment } from "../../lib/route-segment"
import { articleOpenGraphImage } from "../../lib/open-graph"
import { getPostSummary } from "../../lib/publication-content"
import { normalizeTags } from "../../lib/tags"
import { seriesPostOrder } from "../../lib/series-order"
import { blogCardSelect } from "../../lib/blog-card"
import zh from "../../messages/zh.json"

interface PublicMetadataRoute {
  metadata?: Metadata
  generateMetadata?: (input: { params: Promise<Record<string, string>> }) => Promise<Metadata>
}

// Execute the real route's metadata export with request/DB adapters, without a Next server.
// Page-only dependencies fail if metadata accidentally starts relying on their stubs.
export function loadPublicMetadataRoute(file: string, database: object = {}): PublicMetadataRoute {
  const dependencies: Record<string, unknown> = {
    react: { cache: (fn: unknown) => fn },
    "@/lib/db": { prisma: database },
    "@/lib/public-metadata": { publicPageMetadata },
    "@/lib/site": { absoluteUrl },
    "@/lib/route-segment": { decodeRouteSegment },
    "@/lib/open-graph": { articleOpenGraphImage },
    "@/lib/publication-content": { getPostSummary },
    "@/lib/tags": { normalizeTags },
    "@/lib/series-order": { seriesPostOrder },
    "@/lib/blog-card": { blogCardSelect },
    "next-intl/server": {
      getTranslations: async ({ locale, namespace }: { locale: string; namespace: "home" | "about" | "projects" | "blog" }) => {
        if (locale !== "zh") throw new Error(`Unexpected metadata locale: ${locale}`)
        return (key: "metadataTitle" | "metadataDescription") => zh[namespace][key]
      },
    },
  }
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  const evaluate = new Script(`(function(require, module, exports) { ${source}\n})`, { filename: file }).runInThisContext()
  evaluate((specifier: string) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier]
    return new Proxy({}, { get: (_target, key) => {
      throw new Error(`Metadata used an unstubbed page dependency: ${specifier}.${String(key)}`)
    } })
  }, loadedModule, loadedModule.exports)
  return loadedModule.exports
}
