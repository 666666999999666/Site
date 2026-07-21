import { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Container({
  children,
  className,
  size = "default",
}: {
  children: ReactNode
  className?: string
  size?: "default" | "narrow" | "wide"
}) {
  const max = size === "narrow" ? "max-w-3xl" : "max-w-5xl"
  return <div className={cn("mx-auto px-6", max, className)}>{children}</div>
}
