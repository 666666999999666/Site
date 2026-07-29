import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { HeroSection } from "@/components/home/HeroSection"
import { RecentPosts } from "@/components/home/RecentPosts"
import { LatestProjects, type Project } from "@/components/home/LatestProjects"
import { getRecentPosts } from "@/lib/posts"
import { getRecentProjects } from "@/lib/projects"
import { getPublicSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "home" })
  const pathname = `/${locale}`

  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    alternates: {
      canonical: pathname,
      languages: { zh: "/zh", en: "/en" },
    },
    openGraph: {
      title: t("metadataTitle"),
      description: t("metadataDescription"),
      url: pathname,
      locale: locale === "en" ? "en_US" : "zh_CN",
    },
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const [posts, dbProjects, settings] = await Promise.all([
    getRecentPosts(6),
    getRecentProjects(4),
    getPublicSettings(),
  ])

  const projects: Project[] = dbProjects.map((p) => ({
    name: p.title,
    description: p.description || "",
    tags: p.tags,
    coverImage: p.coverImage || undefined,
    sourceUrl: p.sourceUrl || undefined,
    demoUrl: p.demoUrl || undefined,
  }))

  return (
    <>
      <HeroSection
        name={settings.owner_name}
        role={settings.home_role}
        description={settings.home_tagline}
      />
      <RecentPosts posts={posts} locale={locale} />
      <LatestProjects projects={projects} />
    </>
  )
}
