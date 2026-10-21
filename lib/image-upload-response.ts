/** The original upload and optional responsive processing have separate outcomes. */
export interface ImageUploadResponse {
  url: string
  processing?: {
    status: "ready" | "original-only" | "failed"
    reason?: string
    warning?: string
  }
}

export function imageUploadWarning(upload: Pick<ImageUploadResponse, "processing">): string | null {
  const processing = upload.processing
  if (processing?.warning) return processing.warning
  return processing?.status === "failed"
    ? "原图已上传，响应式图片生成失败；当前使用原图。"
    : null
}
