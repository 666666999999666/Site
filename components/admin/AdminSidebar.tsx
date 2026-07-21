"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, ListTodo, Settings, Home, FolderKanban } from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin", label: "概览", icon: Home },
  { href: "/admin/posts", label: "Blog", icon: FileText },
  { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
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
              "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Icon className="size-4 mr-2" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
