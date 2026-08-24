"use client"

import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"
import { GitHubIcon } from "@/components/icons/GitHubIcon"

export interface Project {
  name: string
  description: string
  tags: string[]
  coverImage?: string
  sourceUrl?: string
  demoUrl?: string
}

export function LatestProjects({ projects }: { projects: Project[] }) {
  const t = useTranslations("home")
  if (projects.length === 0) return null

  return (
    <section className="border-t border-border/40 py-12 sm:py-16">
      <Container>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">{t("latestProjects")}</h2>
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            {t("viewAll")} →
          </Link>
        </div>
        <div className={projects.length === 1 ? "max-w-2xl" : "grid grid-cols-1 gap-4 md:grid-cols-3"}>
          {projects.map((project) => (
            <article key={project.name} className="rounded-lg border border-border/50 p-4 transition-colors hover:border-border hover:bg-muted/40">
              <h3 className="mb-2 font-semibold text-foreground">{project.name}</h3>
              <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {project.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                {project.sourceUrl && (
                  <a href={project.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <GitHubIcon className="size-3.5" />
                    {t("source")}
                  </a>
                )}
                {project.demoUrl && (
                  <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <ExternalLink className="size-3.5" />
                    {t("demo")}
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
