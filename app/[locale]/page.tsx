import { HeroSection } from "@/components/home/HeroSection"
import { RecentPosts } from "@/components/home/RecentPosts"
import { LatestProjects, type Project } from "@/components/home/LatestProjects"
import { getRecentPosts } from "@/lib/posts"

export const dynamic = "force-dynamic"
export const revalidate = 3600

// 暂时使用硬编码的项目数据，后续可从数据库获取
const sampleProjects: Project[] = []

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const posts = await getRecentPosts(6)

  return (
    <>
      <HeroSection />
      <RecentPosts posts={posts} locale={locale} />
      <LatestProjects projects={sampleProjects} />
    </>
  )
}
