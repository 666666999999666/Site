import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('sitemap queries live published content instead of freezing the build-safe empty client', () => {
  const source = readFileSync('app/sitemap.ts', 'utf8')
  assert.match(source, /export const dynamic = "force-dynamic"/)
  assert.match(source, /where: \{ status: "PUBLISHED" \}/)
  assert.match(source, /posts: \{ some: \{ status: "PUBLISHED" \} \}/)
})

test('public layout offers a keyboard-visible skip link to a focusable main target', () => {
  const source = readFileSync('app/[locale]/layout.tsx', 'utf8')
  assert.match(source, /href="#main-content"/)
  assert.match(source, /<main id="main-content" tabIndex=\{-1\}/)
  assert.match(readFileSync('app/globals.css', 'utf8'), /\.skip-link:focus/)
})

test('sitemap runtime output follows publication state and latest series content date', async () => {
  let published = true
  const updated = new Date('2026-10-20T00:00:00Z')
  const database = {
    post: { findMany: async (query: { where: { status: string } }) => {
      assert.equal(query.where.status, 'PUBLISHED')
      return published ? [{ slug: 'diagram', tags: ['Agent、Workflow'], updatedAt: updated }] : []
    } },
    series: { findMany: async (query: { where: { posts: { some: { status: string } } } }) => {
      assert.equal(query.where.posts.some.status, 'PUBLISHED')
      return published ? [{ slug: 'learning', updatedAt: new Date('2026-09-01T00:00:00Z'), posts: [{ updatedAt: updated }] }] : []
    } },
  }
  const globalDatabase = globalThis as unknown as { prisma: typeof database | undefined }
  globalDatabase.prisma = database
  const { default: sitemap } = await import('../app/sitemap')
  const first = await sitemap()
  assert.ok(first.some((entry) => entry.url.endsWith('/zh/blog/diagram')))
  assert.equal(first.find((entry) => entry.url.endsWith('/zh/blog/series/learning'))?.lastModified?.toString(), updated.toString())
  assert.ok(first.some((entry) => entry.url.endsWith('/zh/blog/tags/Workflow')))
  assert.equal(first.some((entry) => entry.url.includes(encodeURIComponent('Agent、Workflow'))), false)
  published = false
  const second = await sitemap()
  assert.equal(second.some((entry) => entry.url.endsWith('/zh/blog/diagram')), false)
  assert.equal(second.some((entry) => entry.url.endsWith('/zh/blog/series/learning')), false)
  globalDatabase.prisma = undefined
})
