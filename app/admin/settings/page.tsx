import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { SettingsForm } from "@/components/admin/SettingsForm"
import { PasswordForm } from "@/components/admin/PasswordForm"

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value

  return (
    <Container>
      <h1 className="text-3xl font-semibold mb-8">Settings</h1>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">个人信息</h2>
        <SettingsForm initial={map} />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">修改密码</h2>
        <PasswordForm />
      </section>
    </Container>
  )
}
