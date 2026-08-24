import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { HeroSection } from "@/components/home/HeroSection"
import { RecentPosts } from "@/components/home/RecentPosts"
import { LatestProjects, type Project } from "@/components/home/LatestProjects"
import { getRecentPosts } from "@/lib/posts"
import { getRecentProjects } from "@/lib/projects"
import { getPublicSettings } from "@/lib/settings"
import { JsonLd } from "@/components/seo/JsonLd"
import { absoluteUrl } from "@/lib/site"
import { prisma } from "@/lib/db"
import { hasPublicProjectEvidence } from "@/lib/public-projects"
import { FeaturedSeries } from "@/components/home/FeaturedSeries"
import { HomeAboutContact } from "@/components/home/HomeAboutContact"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "home" })
  const pathname = "/zh"

  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    alternates: {
      canonical: pathname,
    },
    openGraph: {
      title: t("metadataTitle"),
      description: t("metadataDescription"),
      url: pathname,
      locale: "zh_CN",
    },
  }
}

export default async function Home() {
  const [posts, dbProjects, settings, featuredSeries] = await Promise.all([
    getRecentPosts(6),
    getRecentProjects(8),
    getPublicSettings(),
    prisma.series.findMany({
      where: { posts: { some: { status: "PUBLISHED" } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      take: 3,
      include: {
        _count: { select: { posts: { where: { status: "PUBLISHED" } } } },
        posts: {
          where: { status: "PUBLISHED" },
          orderBy: [{ seriesOrder: "asc" }, { publishedAt: "asc" }],
          take: 1,
          select: { title: true, slug: true },
        },
      },
    }),
  ])

  const projects: Project[] = dbProjects
    .filter(hasPublicProjectEvidence)
    .slice(0, 1)
    .map((project) => ({
      name: project.title,
      description: project.description || "",
      tags: project.tags,
      sourceUrl: project.sourceUrl || undefined,
      demoUrl: project.demoUrl || undefined,
    }))

  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Person",
        name: settings.owner_name,
        url: absoluteUrl("/zh"),
        jobTitle: settings.home_role,
        description: settings.home_tagline,
        ...(settings.about_github ? { sameAs: [settings.about_github] } : {}),
        ...(settings.email ? { email: `mailto:${settings.email}` } : {}),
      }} />
      <HeroSection
        name={settings.owner_name}
        role={settings.home_role}
        description={settings.home_tagline}
      />
      <FeaturedSeries items={featuredSeries.map((item) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        description: item.description,
        postCount: item._count.posts,
        firstPost: item.posts[0] ?? null,
      }))} />
      <RecentPosts posts={posts} />
      <LatestProjects projects={projects} />
      <HomeAboutContact
        description={settings.about_intro || settings.home_tagline}
        email={settings.email}
        githubUrl={settings.about_github}
      />
    </>
  )
}
