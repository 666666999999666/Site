import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

type Messages = Record<string, unknown>

function leafPaths(value: Messages, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === "object" && child !== null
      ? leafPaths(child as Messages, path)
      : [path]
  }).sort()
}

async function readMessages(locale: "zh" | "en"): Promise<Messages> {
  const raw = await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")
  return JSON.parse(raw) as Messages
}

test("Chinese and English message files have identical keys", async () => {
  const [zh, en] = await Promise.all([readMessages("zh"), readMessages("en")])
  assert.deepEqual(leafPaths(en), leafPaths(zh))
})

test("English system messages do not fall back to hard-coded Chinese", async () => {
  const en = await readMessages("en")
  const values = JSON.stringify(en)
  assert.doesNotMatch(values, /[\u3400-\u9fff]/u)
  assert.match(values, /Switch to Chinese/)
  assert.match(values, /Admin entry/)
})
