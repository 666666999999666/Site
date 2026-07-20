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
  const max = size === "narrow" ? "max-w-[720px]" : size === "wide" ? "max-w-[1100px]" : "max-w-[920px]"
  return <div className={cn("mx-auto px-6", max, className)}>{children}</div>
}
