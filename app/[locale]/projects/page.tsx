import type { Metadata } from "next"
import Image from "next/image"
import { ExternalLink } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Container } from "@/components/layout/Container"
import { getAllProjects } from "@/lib/projects"
import { GitHubIcon } from "@/components/icons/GitHubIcon"
import { hasPublicProjectEvidence } from "@/lib/public-projects"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "projects" })
  const pathname = "/zh/projects"

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

export default async function ProjectsPage() {
  const t = await getTranslations("projects")
  const projects = (await getAllProjects()).filter(hasPublicProjectEvidence)

  return (
    <section className="py-16">
      <Container>
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("description")}</p>
        </div>

        {projects.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {projects.map((project) => (
              <article
                key={project.id}
                className={`group overflow-hidden rounded-lg border border-border/50 transition-all hover:border-border hover:bg-muted/30 ${
                  projects.length === 1 ? "sm:col-span-2" : ""
                }`}
              >
                {project.coverImage && (
                  <Image
                    src={project.coverImage}
                    alt={t("cover", { name: project.title })}
                    width={1600}
                    height={700}
                    className="aspect-[16/7] w-full object-cover"
                    unoptimized
                  />
                )}
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-foreground transition-colors group-hover:text-foreground/80">
                    {project.title}
                  </h2>
                  {project.description && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {project.sourceUrl && (
                      <a
                        href={project.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <GitHubIcon className="size-3.5" />
                        {t("source")}
                      </a>
                    )}
                    {project.demoUrl && (
                      <a
                        href={project.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                        {t("demo")}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
