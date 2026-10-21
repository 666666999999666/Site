import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test, { type TestContext } from 'node:test'
import sharp from 'sharp'

const execute = promisify(execFile)
const cli = path.resolve('scripts/prepare-image-variants.ts')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function json(filename: string) { return JSON.parse(await readFile(filename, 'utf8')) }
async function run(...args: string[]) {
  try {
    const result = await execute(process.execPath, ['--import', 'tsx', cli, ...args], { maxBuffer: 4 * 1024 * 1024 })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string }
    if (typeof result.code !== 'number') throw error
    return { code: result.code, stdout: result.stdout, stderr: result.stderr }
  }
}
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'qz-image-cli-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = path.join(root, 'originals'), resources = path.join(root, 'preview-resources'), target = path.join(root, 'target')
  await mkdir(input); await mkdir(target)
  const original = await sharp({ create: { width: 1280, height: 900, channels: 3, background: '#316fc4' } }).png({ compressionLevel: 0 }).toBuffer()
  await writeFile(path.join(input, 'example.png'), original); await writeFile(path.join(target, 'example.png'), original)
  return { root, input, resources, target, original, plan: path.join(root, 'plan.json'), preview: path.join(root, 'preview.json'), apply: path.join(root, 'apply.json') }
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  const planned = await run('plan', '--input', f.input, '--plan', f.plan)
  assert.equal(planned.code, 0, planned.stderr)
  const previewed = await run('preview', '--plan', f.plan, '--output', f.resources, '--report', f.preview)
  assert.equal(previewed.code, 0, previewed.stderr)
  return hash(await readFile(f.preview))
}
async function apply(f: Awaited<ReturnType<typeof fixture>>, reviewed: string, report = f.apply) {
  return run('apply', '--plan', f.plan, '--preview', f.preview, '--target', f.target, '--report', report, '--reviewed-preview-sha256', reviewed)
}

test('image CLI plan is read-only and forbids a plan inside originals', async t => {
  const f = await fixture(t), before = await stat(path.join(f.input, 'example.png'))
  await writeFile(path.join(f.input, 'example.png.qz-640.webp'), 'existing derivative')
  const planned = await run('plan', '--input', f.input, '--plan', f.plan)
  assert.equal(planned.code, 0, planned.stderr)
  const plan = await json(f.plan)
  assert.equal(plan.entries.length, 1)
  assert.equal(plan.entries[0].sha256, hash(f.original))
  assert.equal(plan.entries[0].width, 1280)
  assert.equal(plan.entries[0].height, 900)
  assert.equal(plan.entries[0].existingSet, 'missing-or-invalid')
  assert.equal(plan.entries[0].action, 'prepare')
  assert.equal(plan.ignored[0].filename, 'example.png.qz-640.webp')
  assert.equal((await stat(path.join(f.input, 'example.png'))).mtimeMs, before.mtimeMs)
  assert.deepEqual(await readFile(path.join(f.input, 'example.png')), f.original)
  assert.equal(await readFile(path.join(f.input, 'example.png.qz-640.webp'), 'utf8'), 'existing derivative')
  assert.equal((await run('plan', '--input', f.input, '--plan', path.join(f.input, 'forbidden.json'))).code, 1)
  assert.equal((await run('plan', '--input', f.input, '--plan', f.plan)).code, 1, 'Existing plans must never be silently replaced')
})

test('image CLI plan-preview-reviewed apply publishes only derivatives and safely skips a repeated set', async t => {
  const f = await fixture(t), reviewed = await prepare(f)
  assert.deepEqual(await readdir(f.target), ['example.png'])
  assert.deepEqual(await readFile(path.join(f.input, 'example.png')), f.original)
  assert.match(await readFile(path.join(f.root, 'preview.html'), 'utf8'), /图片派生预览/)
  const first = await apply(f, reviewed)
  assert.equal(first.code, 0, first.stderr)
  const manifest = await json(path.join(f.target, 'example.png.qz-image.json'))
  assert.equal(manifest.sha256, hash(f.original))
  assert(manifest.variants.length > 0)
  for (const variant of manifest.variants) {
    const bytes = await readFile(path.join(f.target, path.basename(variant.url)))
    assert.equal(hash(bytes), variant.sha256)
    assert(bytes.length < f.original.length)
  }
  const manifestTime = (await stat(path.join(f.target, 'example.png.qz-image.json'))).mtimeMs
  const repeated = await apply(f, reviewed)
  assert.equal(repeated.code, 0, repeated.stderr)
  assert.equal((await json(f.apply)).entries[0].reused, true)
  assert.equal((await stat(path.join(f.target, 'example.png.qz-image.json'))).mtimeMs, manifestTime)
  assert.deepEqual(await readFile(path.join(f.target, 'example.png')), f.original)
  assert((await readdir(f.target)).every(name => name === 'example.png' || name.startsWith('example.png.qz-') || name === '.mcp-staging'))
})

test('image CLI source and target SHA preconditions detect equal-length changes', async t => {
  const f = await fixture(t), reviewed = await prepare(f)
  const changed = Buffer.from(f.original); changed[changed.length - 1] ^= 1
  await writeFile(path.join(f.target, 'example.png'), changed)
  const rejected = await apply(f, reviewed)
  assert.equal(rejected.code, 1)
  assert.match((await json(f.apply)).entries[0].reason, /Target original SHA-256/)
  assert.deepEqual(await readdir(f.target), ['example.png'])
  assert.deepEqual(await readFile(path.join(f.target, 'example.png')), changed)
  await writeFile(path.join(f.input, 'example.png'), changed)
  const previewed = await run('preview', '--plan', f.plan, '--output', f.resources, '--report', f.preview)
  assert.equal(previewed.code, 1)
  assert.match((await json(f.preview)).entries[0].reason, /Original SHA-256/)
})

test('image CLI preserves partial apply successes and resumes after the target precondition is repaired', async t => {
  const f = await fixture(t)
  await copyFile(path.join(f.input, 'example.png'), path.join(f.input, 'second.png'))
  await copyFile(path.join(f.input, 'example.png'), path.join(f.target, 'second.png'))
  const reviewed = await prepare(f)
  const changed = Buffer.from(f.original); changed[changed.length - 1] ^= 1
  await writeFile(path.join(f.target, 'example.png'), changed)
  assert.equal((await apply(f, reviewed)).code, 1)
  const partial = await json(f.apply)
  assert.deepEqual(partial.entries.map((entry: { status: string }) => entry.status), ['failed', 'ready'])
  assert.equal((await json(path.join(f.target, 'second.png.qz-image.json'))).sha256, hash(f.original))
  // This repair is an explicit test-fixture action; the CLI never repairs an original.
  await writeFile(path.join(f.target, 'example.png'), f.original)
  assert.equal((await apply(f, reviewed)).code, 0)
  const retried = await json(f.apply)
  assert.deepEqual(retried.entries.map((entry: { status: string }) => entry.status), ['ready', 'ready'])
  assert.equal(retried.entries[1].reused, true)
})

test('image CLI preview continues past a corrupt image and reuses completed healthy images', async t => {
  const f = await fixture(t)
  await writeFile(path.join(f.input, 'broken.png'), 'not an encoded image')
  assert.equal((await run('plan', '--input', f.input, '--plan', f.plan)).code, 1, 'Corrupt source metadata must be reported during planning')
  const args = ['preview', '--plan', f.plan, '--output', f.resources, '--report', f.preview]
  assert.equal((await run(...args)).code, 1)
  let result = await json(f.preview)
  assert.deepEqual(result.entries.map((entry: { status: string }) => entry.status), ['failed', 'ready'])
  assert.equal((await run(...args)).code, 1)
  result = await json(f.preview)
  assert.equal(result.entries[1].reused, true)
  assert.deepEqual(await readFile(path.join(f.input, 'example.png')), f.original)
})

test('image CLI binds review to plan, report and sidecar bytes before publication', async t => {
  const f = await fixture(t), reviewed = await prepare(f)
  assert.equal((await apply(f, '0'.repeat(64))).code, 1)
  await writeFile(path.join(f.resources, 'example.png.qz-image.json'), '{}\n')
  assert.equal((await apply(f, reviewed)).code, 1)
  assert.match((await json(f.apply)).entries[0].reason, /manifest changed after preview review/)
  assert.deepEqual(await readdir(f.target), ['example.png'])
})

test('image CLI apply uses reviewed portable resources without requiring the old input directory', async t => {
  const f = await fixture(t), reviewed = await prepare(f)
  await rm(f.input, { recursive: true })
  assert.equal((await apply(f, reviewed)).code, 0)
  assert.deepEqual(await readFile(path.join(f.target, 'example.png')), f.original)
})

test('legacy image CLI invocation prepares a resumable preview and never applies to originals', async t => {
  const f = await fixture(t)
  const args = ['--input', f.input, '--output', f.resources]
  assert.equal((await run(...args)).code, 0)
  assert.equal((await run(...args)).code, 0)
  assert.equal((await json(f.resources + '.preview.json')).entries[0].reused, true)
  assert.deepEqual(await readdir(f.input), ['example.png'])
  assert.deepEqual(await readdir(f.target), ['example.png'])
  assert.equal((await run('preview', '--plan', f.resources + '.plan.json', '--output', f.resources, '--report', path.join(f.resources, 'forbidden.json'))).code, 1)
})

test('image CLI publishes a reviewed dimensions-only manifest even without beneficial width variants', async t => {
  const f = await fixture(t)
  const small = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#315fc4' } }).png().toBuffer()
  await writeFile(path.join(f.input, 'example.png'), small)
  await writeFile(path.join(f.target, 'example.png'), small)
  const reviewed = await prepare(f)
  const preview = await json(f.preview)
  assert.equal(preview.entries[0].status, 'original-only')
  assert.match(preview.entries[0].manifestSha256, /^[0-9a-f]{64}$/)
  assert.equal((await apply(f, reviewed)).code, 0)
  const published = await json(path.join(f.target, 'example.png.qz-image.json'))
  assert.deepEqual(published.variants, [])
  assert.equal(published.width, 320)
  assert.equal(published.height, 180)
  assert.equal(published.sha256, hash(small))
  assert.deepEqual(await readFile(path.join(f.target, 'example.png')), small)
  assert.match((await json(f.apply)).entries[0].publishedManifestSha256, /^[0-9a-f]{64}$/)
})

test('legacy variant bytes remain bound to the reviewed preview even without hashes in the legacy sidecar', async t => {
  const f = await fixture(t)
  await prepare(f)
  const sidecarPath = path.join(f.resources, 'example.png.qz-image.json')
  const legacy = await json(sidecarPath)
  for (const variant of legacy.variants) delete variant.sha256
  await writeFile(sidecarPath, JSON.stringify(legacy, null, 2) + '\n')
  const preview = await run('preview', '--plan', f.plan, '--output', f.resources, '--report', f.preview)
  assert.equal(preview.code, 0, preview.stderr)
  const reviewed = hash(await readFile(f.preview))
  const variantPath = path.join(f.resources, path.basename(legacy.variants[0].url))
  const changed = await readFile(variantPath)
  changed[changed.length - 1] ^= 1
  await writeFile(variantPath, changed)
  assert.equal((await apply(f, reviewed)).code, 1)
  assert.match((await json(f.apply)).entries[0].reason, /Reviewed variant changed after preview review/)
  assert.deepEqual(await readdir(f.target), ['example.png'])
})
