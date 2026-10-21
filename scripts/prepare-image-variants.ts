import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareImageVariants, publishPreparedImageVariants, readImageVariantSet, type ImageVariantResult } from '../lib/image-variants'
import { SAFE_IMAGE_NAME } from '../lib/responsive-image'

type Mode = 'plan' | 'preview' | 'apply' | 'legacy'
type PlanEntry = { filename: string; status: 'planned' | 'failed'; sha256?: string; sourceBytes?: number; reason?: string; width?: number; height?: number; format?: string; frames?: number; orientation?: number; existingSet?: 'valid' | 'missing-or-invalid'; existingVariantWidths?: number[]; action?: 'reuse' | 'preserve-animated' | 'preserve-oriented' | 'prepare' }
interface Plan { version: 1; kind: 'qz-image-variants-plan'; inputDirectory: string; createdAt: string; entries: PlanEntry[]; ignored: { filename: string; reason: string }[] }
interface Entry { filename: string; sourceSha256?: string; status: ImageVariantResult['status']; reason?: string; warning?: string; reused?: boolean; manifestSha256?: string; variantSha256?: Record<string, string>; publishedManifestSha256?: string }
interface Preview { version: 1; kind: 'qz-image-variants-preview'; planSha256: string; resourcesDirectory: string; startedAt: string; finishedAt?: string; entries: Entry[] }
const hashPattern = /^[0-9a-f]{64}$/
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const originalName = (name: string) => SAFE_IMAGE_NAME.test(name) && !name.includes('.qz-')
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
function fail(value: string): never { throw new Error(value) }
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep)

async function directory(value: string) {
  const target = path.resolve(value), info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(target)) !== target) fail('An existing real directory without symbolic links is required: ' + target)
  return target
}
async function destination(value: string) {
  let current = path.resolve(value)
  const suffix: string[] = []
  while (true) {
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || path.resolve(await realpath(current)) !== current) fail('Symbolic-link destination is forbidden: ' + current)
      return path.join(current, ...suffix.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      suffix.push(path.basename(current)); current = parent
    }
  }
}
function outside(file: string, directories: string[]) {
  if (directories.some(parent => inside(file, parent))) fail('Plans and reports must stay outside original/resource directories: ' + file)
}
async function regularBytes(filename: string) {
  const info = await lstat(filename)
  if (!info.isFile() || info.isSymbolicLink()) fail('A regular file, not a link, is required: ' + filename)
  return readFile(filename)
}
async function originalDigest(parent: string, filename: string) {
  if (!originalName(filename)) fail('Unsafe original image filename: ' + filename)
  const file = path.join(parent, filename), before = await lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || await realpath(file) !== file) fail('Original must be a real regular file: ' + filename)
  const bytes = await readFile(file), after = await lstat(file)
  if (!after.isFile() || after.isSymbolicLink() || after.size !== bytes.length || after.mtimeMs !== before.mtimeMs) fail('Original changed during inspection: ' + filename)
  return { sha256: digest(bytes), sourceBytes: bytes.length }
}
async function saveJson(filename: string, value: unknown, replace = true) {
  await mkdir(path.dirname(filename), { recursive: true })
  const text = JSON.stringify(value, null, 2) + '\n'
  if (!replace) { await writeFile(filename, text, { flag: 'wx' }); return }
  try { if ((await lstat(filename)).isSymbolicLink()) fail('Refusing to replace a report symlink') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const temporary = filename + `.tmp-${process.pid}`
  await writeFile(temporary, text, { flag: 'wx' })
  await rename(temporary, filename)
}
async function loadPlan(filename: string) {
  const bytes = await regularBytes(filename), plan = JSON.parse(bytes.toString('utf8')) as Plan
  if (plan.version !== 1 || plan.kind !== 'qz-image-variants-plan' || typeof plan.inputDirectory !== 'string' || !(path.isAbsolute(plan.inputDirectory) || path.win32.isAbsolute(plan.inputDirectory)) || !Array.isArray(plan.entries) || !Array.isArray(plan.ignored)) fail('Invalid image plan')
  const names = new Set<string>()
  for (const item of plan.entries) {
    if (!item || !originalName(item.filename) || names.has(item.filename) || !['planned', 'failed'].includes(item.status)) fail('Invalid or duplicate plan image')
    names.add(item.filename)
    if (item.status === 'planned' && (!hashPattern.test(item.sha256 || '') || !Number.isSafeInteger(item.sourceBytes) || (item.sourceBytes ?? 0) < 1)) fail('Each planned image requires SHA-256 and byte count')
  }
  return { plan, hash: digest(bytes) }
}
async function createPlan(input: string, filename: string) {
  const inputDirectory = await directory(input), planFile = await destination(filename)
  outside(planFile, [inputDirectory])
  const plan: Plan = { version: 1, kind: 'qz-image-variants-plan', inputDirectory, createdAt: new Date().toISOString(), entries: [], ignored: [] }
  const { default: sharp } = await import('sharp')
  const files = (await readdir(inputDirectory, { withFileTypes: true })).sort((a, b) => Buffer.from(a.name).compare(Buffer.from(b.name)))
  for (const file of files) {
    if (!file.isFile() || !originalName(file.name)) { plan.ignored.push({ filename: file.name, reason: file.isSymbolicLink() ? 'symbolic-link' : !file.isFile() ? 'not-a-regular-file' : 'not-an-original-image' }); continue }
    let identity: { sha256: string; sourceBytes: number } | undefined
    try {
      const source = path.join(inputDirectory, file.name)
      identity = await originalDigest(inputDirectory, file.name)
      const metadata = await sharp(source, { limitInputPixels: 40_000_000, animated: true }).metadata()
      if (!metadata.width || !metadata.height) fail('Image dimensions are unavailable')
      const existing = await readImageVariantSet(source)
      if ((await originalDigest(inputDirectory, file.name)).sha256 !== identity.sha256) fail('Original changed during planning')
      const frames = metadata.pages ?? 1, orientation = metadata.orientation ?? 1
      plan.entries.push({ filename: file.name, status: 'planned', ...identity,
        width: metadata.width, height: metadata.height, format: metadata.format, frames, orientation,
        existingSet: existing ? 'valid' : 'missing-or-invalid', existingVariantWidths: existing?.variants.map(item => item.width) ?? [],
        action: existing ? 'reuse' : frames > 1 ? 'preserve-animated' : orientation !== 1 ? 'preserve-oriented' : 'prepare' })
    }
    catch (error) { plan.entries.push({ filename: file.name, status: 'failed', ...identity, reason: message(error) }) }
  }
  await saveJson(planFile, plan, false)
  return { plan, hash: digest(await readFile(planFile)) }
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!)
async function writePreviewHtml(filename: string, plan: Plan, report: Preview, resources: string) {
  const rows: string[] = []
  for (const item of report.entries) {
    const original = path.join(plan.inputDirectory, item.filename)
    const manifest = item.manifestSha256 ? await readImageVariantSet(original, resources) : null
    const images = [`<figure><img src="${escapeHtml(pathToFileURL(original).href)}" alt="原图 ${escapeHtml(item.filename)}"><figcaption>原图，保持不变</figcaption></figure>`]
    for (const variant of manifest?.variants || []) images.push(`<figure><img src="${escapeHtml(pathToFileURL(path.join(resources, path.basename(variant.url))).href)}" alt="${variant.width}像素派生预览"><figcaption>${variant.width} × ${variant.height} · ${variant.bytes} bytes</figcaption></figure>`)
    rows.push(`<section><h2>${escapeHtml(item.filename)}</h2><p>${escapeHtml(item.status)} ${escapeHtml(item.reason || item.warning || '')}</p><div>${images.join('')}</div></section>`)
  }
  await writeFile(filename, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图片派生预览</title><style>body{margin:24px;background:#fff;color:#18181b;font:16px/1.6 system-ui}h1{font-size:28px}h2{font-size:18px;overflow-wrap:anywhere}section{margin:24px 0;padding:16px;border:1px solid #71717a;border-radius:8px}section>div{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;max-width:320px}img{display:block;max-width:100%;height:auto;background:#eee}figcaption{color:#3f3f46;font-size:14px}code{overflow-wrap:anywhere}</style><h1>图片派生预览</h1><p>仅供人工比较，尚未改原图、正文或生产资源。apply 必须提供已审阅报告的 SHA-256。</p><p>计划 SHA-256：<code>${report.planSha256}</code></p>${rows.join('')}</html>`)
}
async function preview(planPath: string, output: string, reportPath: string) {
  const { plan, hash } = await loadPlan(planPath), input = await directory(plan.inputDirectory), resources = await destination(output)
  if (inside(resources, input) || inside(input, resources)) fail('Preview resources must be separate from original images')
  const reportFile = await destination(reportPath), htmlFile = await destination(reportPath.replace(/\.json$/i, '') + '.html')
  for (const file of [reportFile, htmlFile, path.resolve(planPath)]) outside(file, [input, resources])
  if (new Set([reportFile, htmlFile, path.resolve(planPath)]).size !== 3) fail('Plan, preview JSON and HTML paths must differ')
  await mkdir(resources, { recursive: true }); await directory(resources)
  const report: Preview = { version: 1, kind: 'qz-image-variants-preview', planSha256: hash, resourcesDirectory: path.relative(path.dirname(reportFile), resources).split(path.sep).join('/'), startedAt: new Date().toISOString(), entries: [] }
  for (const item of plan.entries) {
    let result: Entry = { filename: item.filename, sourceSha256: item.sha256, status: 'failed' }
    try {
      if (item.status !== 'planned') fail(item.reason || 'Original was not eligible in the plan')
      const actual = await originalDigest(input, item.filename)
      if (actual.sha256 !== item.sha256 || actual.sourceBytes !== item.sourceBytes) fail('Original SHA-256 no longer matches the plan')
      const prepared = await prepareImageVariants(path.join(input, item.filename), resources, { expectedSourceSha256: item.sha256 })
      if (prepared.reason === 'busy') fail('Image preparation is busy; retry this image')
      result = { ...result, status: prepared.status, reason: prepared.reason, warning: prepared.warning, reused: prepared.reused }
      if (prepared.manifest) {
        const validated = await readImageVariantSet(path.join(input, item.filename), resources)
        if (!validated) fail('Prepared image set failed validation')
        result.manifestSha256 = digest(await regularBytes(path.join(resources, `${item.filename}.qz-image.json`)))
        result.variantSha256 = Object.fromEntries(await Promise.all(validated.variants.map(async variant => {
          const name = path.basename(variant.url)
          return [name, digest(await regularBytes(path.join(resources, name)))] as const
        })))
      } else if (prepared.status === 'ready') fail('Prepared image set has no manifest')
    } catch (error) { result.status = 'failed'; result.reason = message(error) }
    report.entries.push(result); await saveJson(reportFile, report)
  }
  report.finishedAt = new Date().toISOString(); await saveJson(reportFile, report)
  await writePreviewHtml(htmlFile, plan, report, resources)
  return { mode: 'preview', resources, report: reportFile, html: htmlFile, previewSha256: digest(await readFile(reportFile)), ready: report.entries.filter(item => item.status === 'ready').length, originalOnly: report.entries.filter(item => item.status === 'original-only').length, failed: report.entries.filter(item => item.status === 'failed').length, reused: report.entries.filter(item => item.reused).length }
}
async function apply(planPath: string, previewPath: string, targetPath: string, reportPath: string, reviewedSha: string) {
  if (!hashPattern.test(reviewedSha)) fail('apply requires --reviewed-preview-sha256 from the report actually reviewed')
  const { plan, hash } = await loadPlan(planPath), previewBytes = await regularBytes(previewPath)
  if (digest(previewBytes) !== reviewedSha) fail('Reviewed preview report SHA-256 does not match')
  const reviewed = JSON.parse(previewBytes.toString('utf8')) as Preview
  if (reviewed.version !== 1 || reviewed.kind !== 'qz-image-variants-preview' || reviewed.planSha256 !== hash || !reviewed.finishedAt || !Array.isArray(reviewed.entries) || typeof reviewed.resourcesDirectory !== 'string') fail('Preview is incomplete or belongs to another plan')
  const target = await directory(targetPath), resources = await directory(path.resolve(path.dirname(previewPath), reviewed.resourcesDirectory))
  if (inside(resources, target) || inside(target, resources)) fail('Reviewed resources must be separate from target original images')
  const reportFile = await destination(reportPath)
  outside(reportFile, [target, resources, path.resolve(plan.inputDirectory)])
  outside(path.resolve(planPath), [target, resources]); outside(path.resolve(previewPath), [target, resources])
  if ([path.resolve(planPath), path.resolve(previewPath)].includes(reportFile)) fail('Apply report must not replace the plan or preview')
  const entries = new Map<string, Entry>()
  for (const item of reviewed.entries) {
    if (!item || !originalName(item.filename) || entries.has(item.filename)) fail('Invalid or duplicate preview entry')
    entries.set(item.filename, item)
  }
  if (entries.size !== plan.entries.length) fail('Preview must cover exactly the plan images')
  const report = { version: 1, kind: 'qz-image-variants-apply', planSha256: hash, reviewedPreviewSha256: reviewedSha, targetDirectory: target, startedAt: new Date().toISOString(), finishedAt: '', entries: [] as Entry[] }
  for (const item of plan.entries) {
    let result: Entry = { filename: item.filename, sourceSha256: item.sha256, status: 'failed' }
    try {
      const approved = entries.get(item.filename)
      if (item.status !== 'planned' || !approved || approved.sourceSha256 !== item.sha256) fail('Plan and reviewed preview original identity differ')
      if (approved.status === 'failed') fail('Preview failed for this original; review a successful retry first')
      const actual = await originalDigest(target, item.filename)
      if (actual.sha256 !== item.sha256 || actual.sourceBytes !== item.sourceBytes) fail('Target original SHA-256 does not match the plan')
      if (approved.reason === 'busy') fail('Reviewed image preparation was busy; review a successful retry first')
      if (approved.status === 'original-only' && !approved.manifestSha256) result = { ...result, status: 'original-only', reason: approved.reason }
      else {
        if (!['ready', 'original-only'].includes(approved.status) || !hashPattern.test(approved.manifestSha256 || '')) fail('Reviewed set has no manifest identity')
        if (digest(await regularBytes(path.join(resources, `${item.filename}.qz-image.json`))) !== approved.manifestSha256) fail('Prepared manifest changed after preview review')
        const validated = await readImageVariantSet(path.join(target, item.filename), resources)
        if (!validated) fail('Prepared image set failed validation before publication')
        if (!approved.variantSha256 || typeof approved.variantSha256 !== 'object' || Array.isArray(approved.variantSha256) || Object.keys(approved.variantSha256).length !== validated.variants.length) fail('Reviewed variant identities are missing or invalid')
        for (const variant of validated.variants) {
          const name = path.basename(variant.url), expected = approved.variantSha256[name]
          if (!hashPattern.test(expected || '') || digest(await regularBytes(path.join(resources, name))) !== expected) fail('Reviewed variant changed after preview review: ' + name)
        }
        const published = await publishPreparedImageVariants(path.join(target, item.filename), resources, target, item.sha256!)
        result = { ...result, status: published.status, reason: published.reason, warning: published.warning, reused: published.reused, manifestSha256: approved.manifestSha256 }
        if (published.reason === 'busy') fail('Image publication is busy; retry this image')
        if (published.manifest) result.publishedManifestSha256 = digest(await regularBytes(path.join(target, `${item.filename}.qz-image.json`)))
      }
    } catch (error) { result.status = 'failed'; result.reason = message(error) }
    report.entries.push(result); await saveJson(reportFile, report)
  }
  report.finishedAt = new Date().toISOString(); await saveJson(reportFile, report)
  return { mode: 'apply', report: reportFile, ready: report.entries.filter(item => item.status === 'ready').length, originalOnly: report.entries.filter(item => item.status === 'original-only').length, failed: report.entries.filter(item => item.status === 'failed').length, reused: report.entries.filter(item => item.reused).length }
}
function argumentsFor(args: string[]) {
  let mode: Mode = 'legacy'
  if (args[0] && !args[0].startsWith('--')) { if (!['plan', 'preview', 'apply'].includes(args[0])) fail('Mode must be plan, preview or apply'); mode = args.shift() as Mode }
  const allowed: Record<Mode, string[]> = { plan: ['input', 'plan'], preview: ['plan', 'output', 'report'], apply: ['plan', 'preview', 'target', 'report', 'reviewed-preview-sha256'], legacy: ['input', 'output'] }
  const options: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, ''), value = args[index + 1]
    if (!args[index]?.startsWith('--') || !allowed[mode].includes(name) || !value || value.startsWith('--') || name in options) fail('Invalid, unknown, duplicate or missing CLI argument')
    options[name] = value
  }
  if (allowed[mode].some(name => !options[name])) fail('Usage: prepare-image-variants.ts ' + (mode === 'legacy' ? '--input <originals> --output <preview-resources>' : mode + ' ' + allowed[mode].map(name => '--' + name + ' <value>').join(' ')))
  return { mode, options }
}
async function main() {
  const { mode, options } = argumentsFor(process.argv.slice(2))
  let summary: Record<string, unknown>
  if (mode === 'plan') { const { plan, hash } = await createPlan(options.input, options.plan); summary = { mode, plan: path.resolve(options.plan), planSha256: hash, planned: plan.entries.filter(item => item.status === 'planned').length, ignored: plan.ignored.length, failed: plan.entries.filter(item => item.status === 'failed').length } }
  else if (mode === 'preview') summary = await preview(options.plan, options.output, options.report)
  else if (mode === 'apply') summary = await apply(options.plan, options.preview, options.target, options.report, options['reviewed-preview-sha256'])
  else {
    const planPath = path.resolve(options.output) + '.plan.json'
    try { await lstat(planPath); const { plan } = await loadPlan(planPath); if (plan.inputDirectory !== await directory(options.input)) fail('Convenience plan belongs to another input directory') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await createPlan(options.input, planPath) }
    summary = await preview(planPath, options.output, path.resolve(options.output) + '.preview.json')
    summary.convenience = 'Legacy --input/--output creates a plan and preview only; never applies assets.'
  }
  console.log(JSON.stringify(summary)); if ((summary.failed as number) > 0) process.exitCode = 1
}
main().catch((error: unknown) => { console.error(message(error)); process.exitCode = 1 })
