"use client"

/* eslint-disable @next/next/no-img-element -- The lightbox must preserve arbitrary article image URLs and dimensions. */

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"

interface LightboxImage {
  src: string
  alt: string
}

export function Lightbox() {
  const [image, setImage] = useState<LightboxImage | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const t = useTranslations("content")

  const close = useCallback(() => {
    setImage(null)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    const openImage = (target: HTMLImageElement) => {
      triggerRef.current = target
      setImage({ src: target.currentSrc || target.src, alt: target.alt })
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof HTMLImageElement && target.hasAttribute("data-lightbox-image")) {
        event.preventDefault()
        openImage(target)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        (event.key === "Enter" || event.key === " ") &&
        target instanceof HTMLImageElement &&
        target.hasAttribute("data-lightbox-image")
      ) {
        event.preventDefault()
        openImage(target)
      }
    }

    document.addEventListener("click", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [])

  useEffect(() => {
    if (!image) return
    const previousOverflow = document.body.style.overflow
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleEscape)
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleEscape)
    }
  }, [close, image])

  if (!image) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={t("imagePreview")}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={close}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label={t("closeImagePreview")}
      >
        <X className="size-5" />
      </button>
      <img
        src={image.src}
        alt={image.alt}
        className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
