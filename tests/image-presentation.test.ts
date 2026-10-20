import assert from "node:assert/strict"
import test from "node:test"
import { decodeImageTitle, encodeImageTitle, normalizeImageWidth } from "../lib/image-presentation"

test("display width round-trips separately from image title and alt", () => {
  assert.equal(encodeImageTitle("原图说明", 600), "原图说明 {qz-width=600}")
  assert.deepEqual(decodeImageTitle("原图说明 {qz-width=600}"), { title: "原图说明", width: 600 })
  assert.equal(encodeImageTitle(null, 600), "{qz-width=600}")
  assert.deepEqual(decodeImageTitle("{qz-width=600}"), { title: undefined, width: 600 })
  assert.deepEqual(decodeImageTitle('Caption "quote" \\ slash'), { title: 'Caption "quote" \\ slash', width: undefined })
  assert.equal(encodeImageTitle("Unchanged title", null), "Unchanged title")
})

test("only bounded integer pixel widths are accepted", () => {
  for (const width of [1, 600, 10_000, "600"]) assert.equal(normalizeImageWidth(width), Number(width))
  for (const width of [-1, 0, 10_001, 600.5, Infinity, NaN, "600px", "600; color:red", "1e3", "", null, {}, true]) {
    assert.equal(normalizeImageWidth(width), undefined)
  }
  for (const title of ["{qz-width=0}", "{qz-width=10001}", "{qz-width=600px}", "{qz-width=600} prose", "prose{qz-width=600}"]) {
    assert.deepEqual(decodeImageTitle(title), { title, width: undefined })
  }
  assert.deepEqual(decodeImageTitle(null), { title: undefined, width: undefined })
})

test("numeric historical alt text is not reinterpreted by presentation metadata", () => {
  assert.deepEqual(decodeImageTitle("0.67"), { title: "0.67", width: undefined })
  assert.equal(encodeImageTitle("0.67", 600), "0.67 {qz-width=600}")
})
