import { DesktopAdminSidebar } from "@/components/admin/DesktopAdminSidebar"
import { MobileAdminNav } from "@/components/admin/MobileAdminNav"
import { ThemeProvider } from "@/components/theme/ThemeProvider"

export default function SidebarHarnessPage() {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <MobileAdminNav />
        <div className="flex flex-1">
          <DesktopAdminSidebar />
          <main className="min-w-0 flex-1 p-8">
            <div className="h-full rounded-lg border border-border/50 bg-card p-6 text-card-foreground">
              后台内容区域
            </div>
          </main>
        </div>
      </div>
    </ThemeProvider>
  )
}
