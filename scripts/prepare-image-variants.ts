import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { RESPONSIVE_IMAGE_WIDTHS, SAFE_IMAGE_NAME } from '../lib/responsive-image'

const args = process.argv.slice(2)
function argument(name: string) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
async function main() {
  const input = argument('--input')
  const output = argument('--output')
  if (!input || !output || args.some((arg, index) => index % 2 === 0 && !['--input', '--output'].includes(arg))) {
    throw new Error('Usage: node --import tsx scripts/prepare-image-variants.ts --input <originals-directory> --output <new-output-directory>')
  }
  const inputDirectory = path.resolve(input)
  const outputDirectory = path.resolve(output)
  if (inputDirectory === outputDirectory) throw new Error('Output must differ from the original directory')
  // Non-destructive by construction: an existing output directory is never reused.
  await mkdir(outputDirectory)
  const report = []
  for (const entry of await readdir(inputDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !SAFE_IMAGE_NAME.test(entry.name) || entry.name.includes('.qz-')) continue
    const original = await readFile(path.join(inputDirectory, entry.name))
    const processor = sharp(original, { limitInputPixels: 40_000_000, animated: true })
    const metadata = await processor.metadata()
    if (!metadata.width || !metadata.height) throw new Error(`Image dimensions unavailable: ${entry.name}`)
    if ((metadata.pages ?? 1) > 1 || (metadata.orientation && metadata.orientation !== 1)) {
      report.push({ filename: entry.name, status: 'original-preserved', reason: 'Animated or oriented image needs separate visual review' })
      continue
    }
    const variants = []
    for (const width of RESPONSIVE_IMAGE_WIDTHS) {
      if (width > metadata.width) continue
      const { data, info } = await sharp(original, { limitInputPixels: 40_000_000 }).resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toBuffer({ resolveWithObject: true })
      if (data.length >= original.length) continue
      const filename = `${entry.name}.qz-${width}.webp`
      await writeFile(path.join(outputDirectory, filename), data, { flag: 'wx' })
      variants.push({ url: `/uploads/${filename}`, width: info.width, height: info.height, bytes: data.length })
    }
    const manifest = { version: 1, original: entry.name, sha256: createHash('sha256').update(original).digest('hex'), width: metadata.width, height: metadata.height, sourceBytes: original.length, variants }
    await writeFile(path.join(outputDirectory, `${entry.name}.qz-image.json`), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    report.push(manifest)
  }
  await writeFile(path.join(outputDirectory, 'image-variants-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output: outputDirectory, images: report.length, report: 'image-variants-report.json' }))
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
