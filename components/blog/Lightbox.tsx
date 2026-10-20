"use client"

/* eslint-disable @next/next/no-img-element -- The lightbox must preserve arbitrary article image URLs and dimensions. */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, X, ZoomIn, ZoomOut } from "lucide-react"
import { useTranslations } from "next-intl"
import styles from "./Lightbox.module.css"

interface LightboxImage {
  src: string
  alt: string
  width: number
}

interface Gallery {
  images: LightboxImage[]
  index: number
}

export function Lightbox({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const hintId = useId()
  const t = useTranslations("content")
  const open = gallery !== null
  const image = gallery?.images[gallery.index]
  const close = useCallback(() => setGallery(null), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const openImage = (target: HTMLImageElement) => {
      const images = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-lightbox-image]"))
      triggerRef.current = target
      setZoomed(false)
      setGallery({
        images: images.map((img) => ({
          // Display width never changes the original asset used for zoom or downloads.
          src: img.dataset.originalSrc || img.src,
          alt: img.alt,
          width: Number(img.dataset.originalWidth) || img.naturalWidth,
        })),
        index: images.indexOf(target),
      })
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof HTMLImageElement && target.hasAttribute("data-lightbox-image")) {
        event.preventDefault()
        openImage(target)
      }
    }
    const handleKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target
      if (
        (event.key === "Enter" || event.key === " ") &&
        target instanceof HTMLImageElement && target.hasAttribute("data-lightbox-image")
      ) {
        event.preventDefault()
        openImage(target)
      }
    }
    container.addEventListener("click", handleClick)
    container.addEventListener("keydown", handleKey)
    return () => {
      container.removeEventListener("click", handleClick)
      container.removeEventListener("keydown", handleKey)
    }
  }, [containerRef])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // Native modal dialogs make the entire background inert, including programmatic focus.
    dialog.showModal()
    closeButtonRef.current?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true })
    }
  }, [open])

  const move = (offset: number) => {
    setZoomed(false)
    setGallery((current) => current ? {
      ...current,
      index: (current.index + offset + current.images.length) % current.images.length,
    } : null)
    viewportRef.current?.scrollTo(0, 0)
  }

  const toggleZoom = () => {
    setZoomed((current) => !current)
    viewportRef.current?.scrollTo(0, 0)
    viewportRef.current?.focus({ preventScroll: true })
  }

  const handleKey = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Tab") {
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex="0"]',
      ))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    if (zoomed && viewportRef.current) {
      const viewport = viewportRef.current
      const step = Math.max(80, viewport.clientHeight * 0.15)
      const scroll: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
        PageUp: [0, -viewport.clientHeight * 0.9], PageDown: [0, viewport.clientHeight * 0.9],
      }
      if (scroll[event.key]) {
        event.preventDefault()
        viewport.scrollBy(...scroll[event.key])
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault()
        viewport.scrollTo(event.key === "Home" ? 0 : viewport.scrollWidth, event.key === "Home" ? 0 : viewport.scrollHeight)
      }
    } else if (gallery && gallery.images.length > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault()
      move(event.key === "ArrowLeft" ? -1 : 1)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label={t("imagePreview")}
      aria-describedby={hintId}
      onCancel={(event) => { event.preventDefault(); close() }}
      onClose={(event) => { if (!event.currentTarget.open) close() }}
      onKeyDown={handleKey}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
    >
      {image && gallery && (
        <>
          <div className={styles.toolbar}>
            {gallery.images.length > 1 && (
              <>
                <button type="button" onClick={() => move(-1)} className={styles.control} aria-label={t("previousImage")}>
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <span className={styles.position} aria-live="polite">{t("imagePosition", { current: gallery.index + 1, total: gallery.images.length })}</span>
                <button type="button" onClick={() => move(1)} className={styles.control} aria-label={t("nextImage")}>
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </>
            )}
            <button type="button" onClick={toggleZoom} className={styles.control} aria-pressed={zoomed} aria-label={t(zoomed ? "imageZoomOut" : "imageZoomIn")}>
              {zoomed ? <ZoomOut className="size-5" aria-hidden="true" /> : <ZoomIn className="size-5" aria-hidden="true" />}
              <span>{t(zoomed ? "imageZoomOut" : "imageZoomIn")}</span>
            </button>
            <a href={image.src} target="_blank" rel="noopener noreferrer" className={styles.control}>
              <ExternalLink className="size-4" aria-hidden="true" />{t("imageOriginal")}
            </a>
            <button ref={closeButtonRef} type="button" onClick={close} className={`${styles.control} ${styles.close}`} aria-label={t("closeImagePreview")}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div ref={viewportRef} className={styles.viewport} tabIndex={0} role="region" aria-label={t("imagePanHint")} data-image-viewport>
            <div className={`${styles.stage} ${zoomed ? styles.zoomedStage : ""}`} onClick={(event) => {
              if (!zoomed && event.target === event.currentTarget) close()
            }}>
              <img
                key={image.src}
                src={image.src}
                alt={image.alt}
                draggable={false}
                className={`${styles.image} ${zoomed ? styles.zoomedImage : ""}`}
                style={zoomed && image.width ? { width: image.width } : undefined}
                onClick={toggleZoom}
                onLoad={(event) => {
                  const width = event.currentTarget.naturalWidth
                  setGallery((current) => current ? {
                    ...current,
                    images: current.images.map((item, index) => index === current.index ? { ...item, width } : item),
                  } : null)
                }}
              />
            </div>
          </div>
          <p id={hintId} className={styles.hint}>{t("imagePanHint")}</p>
        </>
      )}
    </dialog>
  )
}
