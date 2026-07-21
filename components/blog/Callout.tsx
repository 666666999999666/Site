import { type ReactNode } from "react"
import { Lightbulb, Info, AlertTriangle, AlertCircle } from "lucide-react"

const variants = {
  tip: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: Lightbulb,
  },
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    text: "text-blue-700 dark:text-blue-400",
    icon: Info,
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    text: "text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
  danger: {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    text: "text-red-700 dark:text-red-400",
    icon: AlertCircle,
  },
} as const

type Variant = keyof typeof variants

export function Callout({
  variant,
  title,
  children,
}: {
  variant: Variant
  title?: string
  children: ReactNode
}) {
  const v = variants[variant]
  const Icon = v.icon

  return (
    <div className={`rounded-lg border ${v.border} ${v.bg} p-4 my-6`}>
      <div className={`flex items-center gap-2 font-medium ${v.text} mb-2`}>
        <Icon className="h-4 w-4 shrink-0" />
        {title && <span>{title}</span>}
      </div>
      <div className="text-sm text-foreground [&_p]:m-0">{children}</div>
    </div>
  )
}
