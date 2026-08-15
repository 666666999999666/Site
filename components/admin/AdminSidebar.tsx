"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bot,
  CalendarDays,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  MessageSquareQuote,
  Settings,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin", label: "今日三件事", icon: Sun },
  { href: "/admin/overview", label: "概览", icon: LayoutDashboard },
  { href: "/admin/daily/history", label: "历史记录", icon: CalendarDays },
  { href: "/admin/daily/quotes", label: "每日提醒语", icon: MessageSquareQuote },
  { href: "/admin/inbox", label: "智能收件箱", icon: Inbox },
  { href: "/admin/posts", label: "文章", icon: FileText },
  { href: "/admin/ideas", label: "Idea", icon: Lightbulb },
  { href: "/admin/todos", label: "Todo", icon: ListTodo },
  { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
  { href: "/admin/mcp", label: "MCP", icon: Bot },
  { href: "/admin/settings", label: "设置", icon: Settings },
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
