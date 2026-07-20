"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, ListTodo, Settings, Home } from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin", label: "概览", icon: Home },
  { href: "/admin/posts", label: "Blog", icon: FileText },
  { href: "/admin/todos", label: "Todo", icon: ListTodo },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function AdminSidebar() {
  const path = usePathname()
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== "/admin" && path.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
              active ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-paper hover:text-ink"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
