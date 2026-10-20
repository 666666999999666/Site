import assert from "node:assert/strict"
import test from "node:test"
import { EditorImageUploads } from "../lib/editor-image-uploads"

test("saving waits for the actual image URL in the document, after the upload response", async () => {
  const uploads = new EditorImageUploads()
  const task = uploads.begin(() => {})
  let saved = false
  const saving = uploads.wait().then(() => { saved = true })
  await Promise.resolve()
  assert.equal(saved, false)
  assert.equal(task.received("/uploads/chosen-file.png"), true)
  uploads.acknowledge(new Set(["/uploads/other.png"]), true)
  await Promise.resolve()
  assert.equal(saved, false)
  uploads.acknowledge(new Set(["/uploads/chosen-file.png"]), false)
  await saving
  assert.equal(saved, true)
})

test("an upload failure rejects the current save but does not poison a successful retry", async () => {
  const uploads = new EditorImageUploads()
  const failed = uploads.begin(() => {})
  const saving = assert.rejects(uploads.wait(), /上传失败/)
  failed.failed(new Error("上传失败"))
  await saving
  const retry = uploads.begin(() => {})
  const retriedSave = uploads.wait()
  retry.received("/uploads/retry.png")
  uploads.acknowledge(new Set(["/uploads/retry.png"]), false)
  await retriedSave
})

test("failure before clicking save leaves no rejected upload task behind", async () => {
  const uploads = new EditorImageUploads()
  uploads.begin(() => {}).failed(new Error("上传失败"))
  // PostEditor separately rejects an empty image in its final document snapshot.
  await uploads.wait()
})

test("all selected images must commit, including a task added while save is waiting", async () => {
  const uploads = new EditorImageUploads()
  const first = uploads.begin(() => {})
  let saved = false
  const saving = uploads.wait().then(() => { saved = true })
  const second = uploads.begin(() => {})
  first.received("/uploads/first.png")
  uploads.acknowledge(new Set(["/uploads/first.png"]), true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(saved, false)
  second.received("/uploads/second.png")
  uploads.acknowledge(new Set(["/uploads/first.png", "/uploads/second.png"]), false)
  await saving
})

test("repeated waiters do not complete until the same document commit", async () => {
  const uploads = new EditorImageUploads()
  const task = uploads.begin(() => {})
  const saves = [uploads.wait(), uploads.wait(), uploads.wait()]
  task.received("/uploads/one.png")
  uploads.acknowledge(new Set(["/uploads/one.png"]), false)
  await Promise.all(saves)
  await uploads.wait()
})

test("removing the pending placeholder cancels its upload and releases the save", async () => {
  const uploads = new EditorImageUploads()
  let cancelled = false
  const task = uploads.begin(() => { cancelled = true })
  const saving = uploads.wait()
  uploads.acknowledge(new Set(), false)
  await saving
  assert.equal(cancelled, true)
  assert.equal(task.cancelled, true)
  assert.equal(task.received("/uploads/removed.png"), false)
  task.failed(new Error("aborted"))
  await uploads.wait()
})

test("replacing an uploading placeholder after its response also cancels its stale URL", async () => {
  const uploads = new EditorImageUploads()
  const task = uploads.begin(() => {})
  task.received("/uploads/stale.png")
  const saving = uploads.wait()
  uploads.acknowledge(new Set(["/uploads/replacement.png"]), false)
  await saving
  assert.equal(task.cancelled, true)
})

test("cancelling one removed target does not complete another empty image upload", async () => {
  const uploads = new EditorImageUploads()
  let cancellations = 0
  const removed = uploads.begin(() => { cancellations++ })
  const retained = uploads.begin(() => { cancellations++ })
  let saved = false
  const saving = uploads.wait().then(() => { saved = true })
  removed.cancel()
  removed.cancel()
  assert.equal(removed.cancelled, true)
  assert.equal(removed.received("/uploads/removed.png"), false)
  assert.equal(cancellations, 1)
  retained.received("/uploads/retained.png")
  uploads.acknowledge(new Set(), true)
  await Promise.resolve()
  assert.equal(saved, false)
  uploads.acknowledge(new Set(["/uploads/retained.png"]), false)
  await saving
  assert.equal(retained.cancelled, false)
  assert.equal(cancellations, 1)
})

test("disposing the editor cancels requests and rejects waiting saves", async () => {
  const uploads = new EditorImageUploads()
  let cancellations = 0
  const first = uploads.begin(() => { cancellations++ })
  const second = uploads.begin(() => { cancellations++ })
  second.received("/uploads/not-yet-committed.png")
  const saving = assert.rejects(uploads.wait(), /编辑器已关闭/)
  uploads.dispose()
  await saving
  assert.equal(cancellations, 2)
  assert.equal(first.cancelled, true)
  assert.equal(second.cancelled, true)
  assert.equal(first.received("/uploads/late.png"), false)
  await assert.rejects(uploads.wait(), /编辑器已关闭/)
  assert.throws(() => uploads.begin(() => {}), /编辑器已关闭/)
})
