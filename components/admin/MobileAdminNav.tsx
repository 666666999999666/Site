"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { AdminSidebar } from "./AdminSidebar"
import { LogoutButton, SignOutButton } from "./LogoutButton"
import { Button } from "@/components/ui/button"

export function MobileAdminNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <span className="font-sans text-lg text-foreground">QZ Site 后台</span>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="菜单">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>
      {open && (
        <div className="border-b border-border/50 p-4 space-y-4">
          <AdminSidebar />
          <LogoutButton />
          <SignOutButton />
        </div>
      )}
    </div>
  )
}
