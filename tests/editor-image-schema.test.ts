import assert from "node:assert/strict"
import test from "node:test"
import type { NodeSchema } from "@milkdown/kit/transformer"
import type { Root } from "mdast"
import { imageBlockPresentationSchema } from "../lib/editor-image-schema"
import { clampEditorSelectionPosition } from "../lib/editor-selection"

async function createHarness() {
  // Milkdown is ESM-only; defer its runtime imports so this runs in the normal TS test suite.
  const { Schema } = await import("@milkdown/kit/prose/model")
  const { ParserState, SerializerState } = await import("@milkdown/kit/transformer")
  const { remark } = await import("remark")
  const doc: NodeSchema = {
    content: "block+",
    parseMarkdown: { match: (node) => node.type === "root", runner: (state, node, type) => { state.injectRoot(node, type) } },
    toMarkdown: { match: (node) => node.type.name === "doc", runner: (state, node) => { state.openNode("root"); state.next(node.content) } },
  }
  const text: NodeSchema = {
    group: "inline",
    parseMarkdown: { match: (node) => node.type === "text", runner: (state, node) => { state.addText(String(node.value)) } },
    toMarkdown: { match: (node) => node.type.name === "text", runner: (state, node) => { state.addNode("text", undefined, node.text) } },
  }
  const paragraph: NodeSchema = {
    content: "inline*", group: "block",
    parseMarkdown: { match: (node) => node.type === "paragraph", runner: (state, node, type) => { state.openNode(type); state.next(node.children); state.closeNode() } },
    toMarkdown: { match: (node) => node.type.name === "paragraph", runner: (state, node) => { state.openNode("paragraph"); state.next(node.content); state.closeNode() } },
  }
  const image: NodeSchema = imageBlockPresentationSchema({
    group: "block", atom: true,
    parseMarkdown: { match: () => false, runner() {} },
    toMarkdown: { match: () => false, runner() {} },
  })
  const schema = new Schema({ nodes: { doc, text, paragraph, "image-block": image } })
  const markdown = remark().use(() => (tree: Root) => {
    // The same paragraph-to-image-block contract used by Crepe's remarkImageBlockPlugin.
    tree.children = tree.children.map((node) => {
      if (node.type === "paragraph" && node.children.length === 1 && node.children[0].type === "image") {
        return { ...node.children[0], type: "image-block" } as unknown as Root["children"][number]
      }
      return node
    })
  })
  return { schema, parse: ParserState.create(schema, markdown), serialize: SerializerState.create(schema, markdown) }
}

test("the editor's production image schema keeps alt, caption and independent width on save/reopen", async () => {
  const { parse, serialize } = await createHarness()
  const original = parse('![普通图片的替代文本](/ordinary.png "普通图片说明")\n\n![长图的替代文本](/long.png "长图说明")')
  assert.equal(original.child(0).attrs.width, null)
  assert.equal(original.child(1).attrs.alt, "长图的替代文本")
  const { EditorState } = await import("@milkdown/kit/prose/state")
  const state = EditorState.create({ doc: original })
  const resized = state.apply(state.tr.setNodeAttribute(0, "width", 600).setNodeAttribute(1, "width", 600))
  const saved = serialize(resized.doc)
  assert.match(saved, /!\[普通图片的替代文本\]\(\/ordinary.png "普通图片说明 \{qz-width=600\}"\)/)
  assert.match(saved, /!\[长图的替代文本\]\(\/long.png "长图说明 \{qz-width=600\}"\)/)
  const reopened = parse(saved)
  assert.ok(reopened.eq(resized.doc))
  assert.deepEqual({ ...reopened.child(0).attrs }, { src: "/ordinary.png", alt: "普通图片的替代文本", caption: "普通图片说明", width: 600 })
})

test("numeric legacy alts and literal punctuation survive editor serialization", async () => {
  const { parse, serialize } = await createHarness()
  for (const markdown of [
    '![0.67](/legacy.png "旧说明")',
    '![包含\\[括号\\]的说明](/image.png "带 &quot; 引号的说明 {qz-width=600}")',
    '![alt](data:image/png;base64,YQ== "caption {qz-width=600}")',
  ]) {
    const document = parse(markdown)
    assert.ok(parse(serialize(document)).eq(document))
  }
  assert.equal(parse('![0.67](/legacy.png)').firstChild!.attrs.alt, "0.67")
  assert.equal(parse('![0.67](/legacy.png)').firstChild!.attrs.width, null)
})

test("image resizing is a single undo step and undo/redo retain original metadata", async () => {
  const { parse, serialize } = await createHarness()
  const { EditorState } = await import("@milkdown/kit/prose/state")
  const { closeHistory, history, undo, redo } = await import("@milkdown/kit/prose/history")
  let state = EditorState.create({ doc: parse('![原始替代文本](/image.png "原始说明")'), plugins: [history()] })
  const original = serialize(state.doc)
  state = state.apply(closeHistory(state.tr).setNodeAttribute(0, "width", 600))
  state = state.apply(closeHistory(state.tr))
  const resized = serialize(state.doc)
  assert.notEqual(resized, original)
  assert.ok(undo(state, (transaction) => { state = state.apply(transaction) }))
  assert.equal(serialize(state.doc), original)
  assert.ok(redo(state, (transaction) => { state = state.apply(transaction) }))
  assert.equal(serialize(state.doc), resized)
  assert.equal(state.doc.firstChild!.attrs.alt, "原始替代文本")
  assert.equal(state.doc.firstChild!.attrs.caption, "原始说明")
})

test("external replacement safely restores selection in single-image and empty documents", async () => {
  const { parse } = await createHarness()
  const { EditorState, Selection } = await import("@milkdown/kit/prose/state")
  const { Slice } = await import("@milkdown/kit/prose/model")
  const state = EditorState.create({ doc: parse("A longer original paragraph") })
  for (const markdown of ['![唯一图片](/only.png "图注 {qz-width=600}")', "", "短文"]) {
    const doc = parse(markdown)
    for (const from of [0, 1, state.doc.content.size, -1]) {
      const tr = state.tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))
      const safeFrom = clampEditorSelectionPosition(from, tr.doc.content.size)
      assert.doesNotThrow(() => tr.setSelection(Selection.near(tr.doc.resolve(safeFrom))))
      assert.ok(tr.selection.from >= 0 && tr.selection.to <= tr.doc.content.size)
    }
  }
})
