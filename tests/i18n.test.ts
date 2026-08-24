import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"
import { routing } from "../i18n/routing"

type Messages = Record<string, unknown>

function leafPaths(value: Messages, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === "object" && child !== null
      ? leafPaths(child as Messages, path)
      : [path]
  }).sort()
}

async function readChineseMessages(): Promise<Messages> {
  const raw = await readFile(new URL("../messages/zh.json", import.meta.url), "utf8")
  return JSON.parse(raw) as Messages
}

test("the Chinese message catalog is the only public locale catalog", async () => {
  const zh = await readChineseMessages()
  const paths = leafPaths(zh)

  assert.ok(paths.length > 0)
  assert.ok(paths.includes("nav.home"))
  assert.ok(paths.includes("adminEntry.label"))
  assert.ok(!paths.includes("nav.switchLanguage"))
  assert.equal((zh.adminEntry as Messages).label, "管理入口")
})

test("routing is explicitly Chinese-only without locale detection or cookies", () => {
  assert.deepEqual([...routing.locales], ["zh"])
  assert.equal(routing.defaultLocale, "zh")
  assert.equal(routing.localePrefix, "always")
  assert.equal(routing.localeCookie, false)
  assert.equal(routing.localeDetection, false)
  assert.equal(routing.alternateLinks, false)
})

test("retired English product artifacts are absent", async () => {
  const retiredArtifacts = [
    new URL("../messages/en.json", import.meta.url),
    new URL("../components/layout/LanguageToggle.tsx", import.meta.url),
  ]

  for (const artifact of retiredArtifacts) {
    await assert.rejects(
      access(artifact),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
      `${artifact.pathname} must remain deleted`
    )
  }
})
