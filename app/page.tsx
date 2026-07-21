import { HeroSection } from "@/components/home/HeroSection"
import { RecentPosts } from "@/components/home/RecentPosts"
import { ContactSection } from "@/components/home/ContactSection"
import { getRecentPosts } from "@/lib/posts"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const revalidate = 3600

async function getSettings() {
  const settings = await prisma.setting.findMany()
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return {
    name: map.owner_name || "你的名字",
    tagline: map.tagline || "今天也想写点什么",
    email: map.email,
  }
}

export default async function Home() {
  const [settings, posts] = await Promise.all([getSettings(), getRecentPosts(5)])
  return (
    <>
      <HeroSection name={settings.name} tagline={settings.tagline} />
      <RecentPosts posts={posts} />
      <ContactSection githubUrl={process.env.NEXT_PUBLIC_GITHUB_URL!} email={settings.email} />
    </>
  )
}
