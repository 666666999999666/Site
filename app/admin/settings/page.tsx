import { prisma } from "@/lib/db"
import { Container } from "@/components/layout/Container"
import { SettingsForm } from "@/components/admin/SettingsForm"
import { PasswordForm } from "@/components/admin/PasswordForm"
import Link from "next/link"
import { FeaturedPostsSettings } from "@/components/admin/FeaturedPostsSettings"

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value

  return (
    <Container>
      <h1 className="text-3xl font-semibold mb-8">设置</h1>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">个人信息</h2>
        <SettingsForm initial={map} />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">首页精选阅读</h2>
        <FeaturedPostsSettings />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4">历史图片</h2>
        <Link href="/admin/settings/image-variants" className="text-sm underline underline-offset-4">历史六图响应式补齐</Link>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">修改密码</h2>
        <PasswordForm />
      </section>
    </Container>
  )
}
