import assert from 'node:assert/strict'
import test from 'node:test'
import { imageDerivativeNames, parseImageManifest } from '../lib/responsive-image'
import { collectReferencedUploadNames } from '../scripts/upload-references'
import { tiptapToMarkdown } from '../lib/content'

const manifest = { version: 1, original: 'test.png', width: 1200, height: 1800, sourceBytes: 400_000,
  variants: [{ url: '/uploads/test.png.qz-640.webp', width: 640, height: 960, bytes: 40_000 }] }

test('responsive metadata validates dimensions and confines variants to original-derived local URLs', () => {
  assert.equal(parseImageManifest(manifest, 'test.png')?.variants[0].width, 640)
  assert.equal(parseImageManifest({ ...manifest, variants: [{ ...manifest.variants[0], url: 'https://evil.invalid/image' }] }, 'test.png'), null)
  assert.equal(parseImageManifest({ ...manifest, variants: [{ ...manifest.variants[0], height: 300 }] }, 'test.png'), null)
  assert.equal(parseImageManifest(manifest, '../test.png'), null)
  assert.equal(parseImageManifest({ ...manifest, original: 'different.png' }, 'test.png'), null)
})

test('active upload references protect their finite derivative set from orphan cleanup', () => {
  const referenced = collectReferencedUploadNames([{ content: '![diagram](/uploads/test.png)', coverImage: null }], [], [])
  for (const filename of imageDerivativeNames('test.png')) assert.ok(referenced.has(filename))
  assert.equal(referenced.has('unrelated.png.qz-640.webp'), false)
  assert.deepEqual(imageDerivativeNames('../test.png'), [])
})

test('legacy Tiptap image width, title and alt survive conversion to Markdown', () => {
  const content = JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { src: '/uploads/test.png', alt: '流程图', title: '详细说明', width: 600, height: 900 } }] })
  assert.equal(tiptapToMarkdown(content), '![流程图](/uploads/test.png "详细说明 {qz-width=600}")')
})
