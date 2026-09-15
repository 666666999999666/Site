import type { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme/ThemeProvider"
import "../../../app/globals.css"
import "./test-layout.css"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  )
}
