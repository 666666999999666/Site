"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  Bot,
  CalendarDays,
  ChevronDown,
  FileText,
  FolderKanban,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  MessageSquareQuote,
  Settings,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"

const dailyItems = [
  { href: "/admin/daily/history", label: "历史记录", icon: CalendarDays },
  { href: "/admin/daily/quotes", label: "每日提醒语", icon: MessageSquareQuote },
]

const items = [
  { href: "/admin/overview", label: "概览", icon: LayoutDashboard },
  { href: "/admin/questions", label: "问题中学", icon: GraduationCap },
  { href: "/admin/inbox", label: "智能收件箱", icon: Inbox },
  { href: "/admin/posts", label: "文章", icon: FileText },
  { href: "/admin/ideas", label: "Idea", icon: Lightbulb },
  { href: "/admin/todos", label: "Todo", icon: ListTodo },
  { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
  { href: "/admin/mcp", label: "MCP", icon: Bot },
  { href: "/admin/settings", label: "设置", icon: Settings },
]

interface AdminSidebarProps {
  collapsed?: boolean
  id?: string
}

export function AdminSidebar({ collapsed = false, id }: AdminSidebarProps = {}) {
  const path = usePathname()
  const dailyChildActive = dailyItems.some(({ href }) => path.startsWith(href))
  const [dailyExpanded, setDailyExpanded] = useState(dailyChildActive)

  const dailyActive = path === "/admin"
  const dailyParentActive = dailyActive || (collapsed && dailyChildActive)

  return (
    <nav id={id} aria-label="后台导航" className="flex flex-col gap-1">
      <div>
        <div className="flex items-center gap-1">
          <Link
            href="/admin"
            title={collapsed ? "每日三件事" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center rounded-md px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-0",
              dailyParentActive
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Sun aria-hidden="true" className={cn("size-4 shrink-0", !collapsed && "mr-2")} />
            <span className={cn(collapsed && "sr-only")}>每日三件事</span>
          </Link>
          {!collapsed && (
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={dailyExpanded ? "收起每日三件事菜单" : "展开每日三件事菜单"}
              aria-expanded={dailyExpanded}
              aria-controls="daily-admin-navigation"
              onClick={() => setDailyExpanded((current) => !current)}
            >
              <ChevronDown
                aria-hidden="true"
                className={cn("size-4 transition-transform", dailyExpanded && "rotate-180")}
              />
            </button>
          )}
        </div>

        {!collapsed && dailyExpanded && (
          <div id="daily-admin-navigation" className="ml-5 mt-1 space-y-1 border-l border-border/70 pl-2">
            {dailyItems.map(({ href, label, icon: Icon }) => {
              const active = path.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon aria-hidden="true" className="mr-2 size-4" /> {label}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== "/admin" && path.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={cn(
              "flex items-center rounded-md px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-0",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Icon aria-hidden="true" className={cn("size-4 shrink-0", !collapsed && "mr-2")} />
            <span className={cn(collapsed && "sr-only")}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
