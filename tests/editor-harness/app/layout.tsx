import type { ReactNode } from "react"
import "../../../app/globals.css"
import "./test-layout.css"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
