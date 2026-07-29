"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { AdminSidebar } from "./AdminSidebar"
import { LogoutButton, SignOutButton } from "./LogoutButton"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/layout/ThemeToggle"

export function MobileAdminNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <span className="font-sans text-lg text-foreground">QZ Site 后台</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            aria-label={open ? "关闭后台菜单" : "打开后台菜单"}
            aria-expanded={open}
            aria-controls="mobile-admin-navigation"
          >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div id="mobile-admin-navigation" className="space-y-4 border-b border-border/50 p-4">
          <AdminSidebar />
          <LogoutButton />
          <SignOutButton />
        </div>
      )}
    </div>
  )
}
