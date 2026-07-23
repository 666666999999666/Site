import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { LogoutButton, SignOutButton } from "@/components/admin/LogoutButton"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect("/")

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border/50 p-4 hidden md:flex flex-col">
        <div className="mb-8 px-4">
          <span className="font-sans text-lg text-foreground">QZ Site 后台</span>
        </div>
        <AdminSidebar />
        <div className="mt-auto pt-4 border-t border-border/50 space-y-1">
          <LogoutButton />
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10 bg-background">{children}</main>
    </div>
  )
}
