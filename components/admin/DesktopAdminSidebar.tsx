"use client"

import { useState } from "react"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { LogoutButton, SignOutButton } from "@/components/admin/LogoutButton"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { cn } from "@/lib/utils"

export function DesktopAdminSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const toggleLabel = collapsed ? "展开后台侧栏" : "收起后台侧栏"

  return (
    <aside
      aria-label="后台侧栏"
      className={cn(
        "hidden shrink-0 flex-col border-r border-border/50 py-4 transition-[width] duration-200 md:flex",
        collapsed ? "w-16 px-2" : "w-56 px-4"
      )}
    >
      <div
        className={cn(
          "mb-8 flex min-h-8 items-center",
          collapsed ? "justify-center" : "justify-between gap-2 px-2"
        )}
      >
        <span className={cn("truncate font-sans text-lg text-foreground", collapsed && "sr-only")}>
          QZ Site 后台
        </span>
        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => setCollapsed((current) => !current)}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>

      <AdminSidebar id="desktop-admin-navigation" collapsed={collapsed} />

      <div
        className={cn(
          "mt-4 flex items-center",
          collapsed ? "justify-center" : "justify-between px-3"
        )}
      >
        <span className={cn("text-xs text-muted-foreground", collapsed && "sr-only")}>主题</span>
        <ThemeToggle />
      </div>

      <div className="mt-4">
        <LogoutButton collapsed={collapsed} />
      </div>
      <div className="mt-auto">
        <SignOutButton collapsed={collapsed} onRequestExpand={() => setCollapsed(false)} />
      </div>
    </aside>
  )
}
