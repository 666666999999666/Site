import { redirect } from "next/navigation"
import { ensureAuthenticated } from "@/lib/api/auth"
import { AuthError } from "@/lib/errors"
import { DesktopAdminSidebar } from "@/components/admin/DesktopAdminSidebar"
import { MobileAdminNav } from "@/components/admin/MobileAdminNav"

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
        <DesktopAdminSidebar />
        <main className="min-w-0 flex-1 bg-background p-4 sm:p-6 md:p-10">{children}</main>
      </div>
    </div>
  )
}
