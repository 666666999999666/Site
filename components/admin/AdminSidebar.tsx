"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, CalendarDays, FileText, FolderKanban, GraduationCap, Inbox, LayoutDashboard, Lightbulb, ListTodo, MessageSquareQuote, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const groups = [
  { label: "日常", items: [
    { href: "/admin", label: "工作台", icon: LayoutDashboard },
    { href: "/admin/ideas", label: "素材", icon: Lightbulb },
    { href: "/admin/todos", label: "Todo", icon: ListTodo },
    { href: "/admin/posts", label: "文章", icon: FileText },
    { href: "/admin/inbox", label: "收件箱", icon: Inbox },
  ] },
  { label: "按需使用", items: [
    { href: "/admin/questions?tab=library", label: "问题中学", icon: GraduationCap },
    { href: "/admin/daily/history", label: "今天想做的事 · 历史", icon: CalendarDays },
  ] },
  { label: "管理", items: [
    { href: "/admin/overview", label: "统计概览", icon: LayoutDashboard },
    { href: "/admin/projects", label: "项目管理", icon: FolderKanban },
    { href: "/admin/mcp", label: "MCP 与审计", icon: Bot },
    { href: "/admin/daily/quotes", label: "提醒语", icon: MessageSquareQuote },
    { href: "/admin/settings", label: "设置与维护", icon: Settings },
  ] },
]

interface AdminSidebarProps { collapsed?: boolean; id?: string }

export function AdminSidebar({ collapsed = false, id }: AdminSidebarProps = {}) {
  const path = usePathname()
  return (
    <nav id={id} aria-label="后台导航" className="space-y-5">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1" role="group" aria-label={group.label}>
          <p className={cn("mb-2 px-3 text-xs text-muted-foreground", collapsed && "sr-only")}>{group.label}</p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const pathname = href.split("?")[0]
            const active = path === pathname || (pathname !== "/admin" && path.startsWith(pathname + "/"))
            return <Link key={href} href={href} title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn("flex items-center rounded-md px-3 py-2 text-sm transition-colors", collapsed && "justify-center px-0",
                active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent")}>
              <Icon aria-hidden="true" className={cn("size-4 shrink-0", !collapsed && "mr-2")} />
              <span className={cn(collapsed && "sr-only")}>{label}</span>
            </Link>
          })}
        </div>
      ))}
    </nav>
  )
}
