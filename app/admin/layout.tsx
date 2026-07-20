import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { LogoutButton } from "@/components/admin/LogoutButton"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn) redirect("/")

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-line p-4 hidden md:block">
        <div className="mb-8 px-4">
          <span className="font-serif text-lg text-ink">QZ Site 后台</span>
        </div>
        <AdminSidebar />
        <div className="mt-8">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  )
}
