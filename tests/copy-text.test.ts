import assert from "node:assert/strict"
import test from "node:test"
import { copyText } from "../lib/copy-text"

async function inBrowser(clipboard: { writeText?: (text: string) => Promise<void> } | undefined, fallback: boolean | Error, check: (state: {
  writes: string[]
  field: { value: string; removed: boolean }
  focusRestored: () => boolean
  selectionRestored: () => boolean
  listeners: Map<string, (event: unknown) => void>
}) => Promise<void>) {
  const originals = new Map(["navigator", "document", "window", "HTMLElement"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  let active: { element: FakeElement }
  class FakeElement {
    isConnected = true
    focus() { active = { element: this } }
  }
  class FakeTextarea extends FakeElement {
    value = ""
    readOnly = false
    tabIndex = 0
    style = { cssText: "" }
    removed = false
    select() {}
    remove() { this.removed = true }
  }
  const trigger = new FakeElement()
  active = { element: trigger }
  const field = new FakeTextarea()
  const writes: string[] = []
  const listeners = new Map<string, (event: unknown) => void>()
  let restored = false
  const range = { commonAncestorContainer: { isConnected: true }, cloneRange: () => range }
  const document = {
    get activeElement() { return active.element },
    createElement: () => field,
    body: { append() {} },
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
    execCommand: (name: string) => {
      assert.equal(name, "copy")
      assert.equal(active.element, field)
      if (fallback instanceof Error) throw fallback
      if (fallback) listeners.get("copy")?.({
        clipboardData: { setData: (type: string, text: string) => { assert.equal(type, "text/plain"); writes.push(text) } },
        preventDefault() {},
      })
      return fallback
    },
  }
  const values = {
    navigator: { clipboard }, document, HTMLElement: FakeElement,
    window: { getSelection: () => ({
      rangeCount: 1, getRangeAt: () => range, removeAllRanges() {}, addRange: () => { restored = true },
    }) },
  }
  try {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value })
    await check({ writes, field, focusRestored: () => active.element === trigger, selectionRestored: () => restored, listeners })
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

const literal = '\n\tconst value = "a b";  \n\n'

test("async clipboard resolves before reporting exact-source success", async () => {
  let written = ""
  await inBrowser({ writeText: async (text) => { written = text } }, false, async ({ field }) => {
    assert.equal(await copyText(literal), true)
    assert.equal(written, literal)
    assert.equal(field.removed, false)
  })
})

test("denied clipboard can use the exact-source fallback and restore focus/selection", async () => {
  await inBrowser({ writeText: async () => { throw new Error("denied") } }, true, async (state) => {
    assert.equal(await copyText(literal), true)
    assert.deepEqual(state.writes, [literal])
    assert.equal(state.field.value, literal)
    assert.equal(state.field.removed, true)
    assert.equal(state.focusRestored(), true)
    assert.equal(state.selectionRestored(), true)
    assert.equal(state.listeners.size, 0)
  })
})

test("missing Clipboard API and a false fallback report failure and clean up", async () => {
  await inBrowser(undefined, false, async (state) => {
    assert.equal(await copyText(literal), false)
    assert.equal(state.field.removed, true)
    assert.equal(state.focusRestored(), true)
    assert.equal(state.listeners.size, 0)
  })
})

test("a throwing fallback never reports success and still restores the document", async () => {
  await inBrowser(undefined, new Error("unsupported"), async (state) => {
    assert.equal(await copyText(literal), false)
    assert.deepEqual(state.writes, [])
    assert.equal(state.field.removed, true)
    assert.equal(state.focusRestored(), true)
    assert.equal(state.selectionRestored(), true)
    assert.equal(state.listeners.size, 0)
  })
})
