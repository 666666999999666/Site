"use client"

import { useTranslations } from "next-intl"
import { Container } from "@/components/layout/Container"

export interface Project {
  name: string
  description: string
  tags: string[]
  demoUrl?: string
}

export function LatestProjects({ projects }: { projects: Project[] }) {
  const t = useTranslations("home")

  if (projects.length === 0) {
    return null
  }

  return (
    <section className="py-16">
      <Container>
        <h2 className="text-2xl font-bold text-foreground mb-8">{t("latestProjects")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {projects.map((project) => (
            <article
              key={project.name}
              className="border border-border/50 rounded-lg p-5 transition-all hover:border-border hover:bg-muted/50"
            >
              <h3 className="text-lg font-semibold text-foreground mb-2">{project.name}</h3>
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {project.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {project.demoUrl && (
                <a
                  href={project.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {t("viewProjects")} →
                </a>
              )}
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
