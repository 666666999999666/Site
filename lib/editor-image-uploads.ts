interface PendingImageUpload {
  url?: string
  cancelled: boolean
  completion: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
  onCancel: () => void
}

/** Upload completion and committing its URL to the editor are separate steps. */
export class EditorImageUploads {
  private readonly pending = new Set<PendingImageUpload>()
  private disposed = false

  begin(onCancel: () => void) {
    if (this.disposed) throw new Error("编辑器已关闭，请重新打开后保存")
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const completion = new Promise<void>((done, fail) => { resolve = done; reject = fail })
    // A failed upload may have no save waiting for it yet. The empty image
    // validation still prevents a later save until the author retries/removes it.
    void completion.catch(() => undefined)
    const task: PendingImageUpload = { cancelled: false, completion, resolve, reject, onCancel }
    this.pending.add(task)
    return {
      received: (url: string) => {
        if (!this.pending.has(task)) return false
        task.url = url
        return true
      },
      failed: (error: unknown) => this.finish(task, error),
      cancel: () => this.cancel(task),
      get cancelled() { return task.cancelled },
    }
  }

  acknowledge(urls: ReadonlySet<string>, hasEmptyImage: boolean) {
    for (const task of this.pending) {
      if (task.url && urls.has(task.url)) this.finish(task)
      else if (!hasEmptyImage) {
        // The author removed/replaced the uploading placeholder. Crepe must
        // receive no URL later, since its old node position is no longer valid.
        this.cancel(task)
      }
    }
  }

  async wait() {
    while (this.pending.size) await Promise.all([...this.pending].map((task) => task.completion))
    if (this.disposed) throw new Error("编辑器已关闭，请重新打开后保存")
  }

  dispose() {
    this.disposed = true
    for (const task of this.pending) {
      task.cancelled = true
      task.onCancel()
      this.finish(task, new Error("编辑器已关闭，请重新打开后保存"))
    }
  }

  private finish(task: PendingImageUpload, error?: unknown) {
    if (!this.pending.delete(task)) return
    if (error !== undefined) task.reject(error)
    else task.resolve()
  }

  private cancel(task: PendingImageUpload) {
    if (!this.pending.has(task)) return
    task.cancelled = true
    task.onCancel()
    this.finish(task)
  }
}
