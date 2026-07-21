import { HeroSection } from "@/components/home/HeroSection"
import { RecentPosts } from "@/components/home/RecentPosts"
import { LatestProjects, type Project } from "@/components/home/LatestProjects"
import { getRecentPosts } from "@/lib/posts"
import { getRecentProjects } from "@/lib/projects"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const revalidate = 3600

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const [posts, dbProjects, taglineSetting] = await Promise.all([
    getRecentPosts(6),
    getRecentProjects(4),
    prisma.setting.findUnique({ where: { key: "home_tagline" } }),
  ])

  const tagline = taglineSetting?.value || undefined
  const projects: Project[] = dbProjects.map((p) => ({
    name: p.title,
    description: p.description || "",
    tags: p.tags,
    demoUrl: p.demoUrl || undefined,
  }))

  return (
    <>
      <HeroSection description={tagline} />
      <RecentPosts posts={posts} locale={locale} />
      <LatestProjects projects={projects} />
    </>
  )
}
