import { redirect } from "next/navigation"
import { ensureAuthenticated } from "@/lib/api/auth"
import { AuthError } from "@/lib/errors"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { MobileAdminNav } from "@/components/admin/MobileAdminNav"
import { LogoutButton, SignOutButton } from "@/components/admin/LogoutButton"
import { ThemeToggle } from "@/components/layout/ThemeToggle"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await ensureAuthenticated()
  } catch (error) {
    if (error instanceof AuthError) redirect("/")
    throw error
  }

  return (
    <div className="min-h-screen flex flex-col">
      <MobileAdminNav />
      <div className="flex flex-1">
        <aside className="w-56 border-r border-border/50 p-4 hidden md:flex flex-col">
          <div className="mb-8 px-4">
            <span className="font-sans text-lg text-foreground">QZ Site 后台</span>
          </div>
          <AdminSidebar />
          <div className="mt-4 flex items-center justify-between px-3">
            <span className="text-xs text-muted-foreground">主题</span>
            <ThemeToggle />
          </div>
          <div className="mt-4">
            <LogoutButton />
          </div>
          <div className="mt-auto">
            <SignOutButton />
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-background p-4 sm:p-6 md:p-10">{children}</main>
      </div>
    </div>
  )
}
