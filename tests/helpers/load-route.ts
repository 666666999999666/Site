import { readFileSync } from "node:fs"
import { ModuleKind, ScriptTarget, transpileModule } from "typescript"

// Execute the real route body with explicit boundary dependencies. This keeps
// request parsing, response construction, and error handling real without opening
// a database connection or booting Next's authentication request context.
export function loadRoute<T>(path: string, dependencies: Record<string, unknown>): T {
  const { outputText } = transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  })
  const exports = {}
  const requireDependency = (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unconfigured route dependency: ${name} in ${path}`)
    return dependencies[name]
  }
  new Function("require", "exports", outputText)(requireDependency, exports)
  return exports as T
}
