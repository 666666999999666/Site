import type { ResponsiveImage } from "@/lib/responsive-image"

// Synthetic test assets only; these byte counts describe fixtures, not production.
export const readerImageMetadata: Record<string, ResponsiveImage> = {
  "/reader-responsive.png": {
    "width": 1600,
    "height": 900,
    "sourceBytes": 36187,
    "variants": [
      {
        "url": "/reader-responsive-640.webp",
        "width": 640,
        "height": 360,
        "bytes": 6738
      },
      {
        "url": "/reader-responsive-960.webp",
        "width": 960,
        "height": 540,
        "bytes": 10546
      },
      {
        "url": "/reader-responsive-1440.webp",
        "width": 1440,
        "height": 810,
        "bytes": 18348
      }
    ]
  }
}
