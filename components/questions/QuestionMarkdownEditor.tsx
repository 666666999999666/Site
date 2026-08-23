"use client"

import { useEffect, useRef, useState } from "react"
import { Eye, ImagePlus, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { QuestionApiError, questionApiRequest, questionErrorMessage } from "@/components/questions/api"
import { QuestionMarkdown } from "@/components/questions/QuestionMarkdown"
import { escapeMarkdownImageAlt } from "@/lib/questions/editor-markdown"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

type UploadedImage = { id: string; url?: string }

export function QuestionMarkdownEditor({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  allowImages = true,
  minRowsClassName = "min-h-64",
  error,
  description,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  allowImages?: boolean
  minRowsClassName?: string
  error?: string
  description?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const valueRef = useRef(value)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const length = Array.from(value).length
  const tooLong = length > 100_000
  const currentError = error || uploadError || (tooLong ? `${label}不能超过 100000 个字符` : "")

  function insertMarkdown(markdown: string) {
    const textarea = textareaRef.current
    const currentValue = valueRef.current
    const start = textarea?.selectionStart ?? currentValue.length
    const end = textarea?.selectionEnd ?? currentValue.length
    const before = currentValue.slice(0, start)
    const after = currentValue.slice(end)
    const prefix = before && !before.endsWith("\n") ? "\n" : ""
    const suffix = after && !after.startsWith("\n") ? "\n" : ""
    const inserted = `${prefix}${markdown}${suffix}`
    const nextValue = `${before}${inserted}${after}`
    valueRef.current = nextValue
    onChange(nextValue)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const cursor = start + inserted.length
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  async function uploadImage(file: File) {
    setUploadError("")
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError("只支持 JPG、PNG、GIF 或 WebP 图片")
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("单张图片不能超过 5 MiB")
      return
    }

    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const uploaded = await questionApiRequest<UploadedImage>("/api/questions/images", {
        method: "POST",
        body,
      })
      const url = uploaded.url || `/api/questions/images/${encodeURIComponent(uploaded.id)}`
      insertMarkdown(`![${escapeMarkdownImageAlt(file.name || "图片")}](${url})`)
    } catch (caught) {
      setUploadError(
        caught instanceof QuestionApiError
          && (caught.status === 413 || caught.message.includes("图片过大"))
          ? "单张图片不能超过 5 MiB"
          : questionErrorMessage(caught, "图片上传失败")
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleFiles(files: File[]) {
    for (const file of files) await uploadImage(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label htmlFor={id}>
            {label}
            {required && <span className="text-destructive" aria-hidden="true">*</span>}
          </Label>
          {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
        </div>
        {allowImages && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              aria-label={`为${label}上传图片`}
              onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              {uploading ? "上传中" : "上传图片"}
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            required={required}
            aria-invalid={Boolean(currentError)}
            aria-describedby={`${id}-help ${id}-error`}
            placeholder={placeholder}
            className={cn("resize-y font-mono leading-6", minRowsClassName)}
            onChange={(event) => {
              setUploadError("")
              onChange(event.target.value)
            }}
            onPaste={(event) => {
              const imageFiles = Array.from(event.clipboardData.items)
                .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file))
              if (imageFiles.length === 0) return
              event.preventDefault()
              if (!allowImages) {
                setUploadError("我的答案不支持图片")
                return
              }
              void handleFiles(imageFiles)
            }}
          />
          <div id={`${id}-help`} className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>{allowImages ? "支持 Markdown，可粘贴或上传私有图片" : "支持 Markdown，不支持图片"}</span>
            <span className={cn("tabular-nums", tooLong && "text-destructive")}>{length} / 100000</span>
          </div>
          <p id={`${id}-error`} className="min-h-5 text-sm text-destructive" role={currentError ? "alert" : undefined}>
            {currentError}
          </p>
        </div>

        <section className={cn("rounded-lg border border-border/70 bg-muted/20 p-4", minRowsClassName)} aria-label={`${label}预览`}>
          <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-3 text-sm font-medium text-muted-foreground">
            <Eye className="size-4" />
            实时预览
          </div>
          <QuestionMarkdown markdown={value} emptyText="输入内容后在这里预览" />
        </section>
      </div>
    </div>
  )
}
