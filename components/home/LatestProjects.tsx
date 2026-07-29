"use client"

import Image from "next/image"
import { ExternalLink } from "lucide-react"
import { useTranslations } from "next-intl"
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
    <section className="py-16">
      <Container>
        <h2 className="mb-8 text-2xl font-bold text-foreground">{t("latestProjects")}</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {projects.map((project) => (
            <article
              key={project.name}
              className={`overflow-hidden rounded-lg border border-border/50 transition-all hover:border-border hover:bg-muted/50 ${
                projects.length === 1 ? "sm:col-span-2" : ""
              }`}
            >
              {project.coverImage && (
                <Image
                  src={project.coverImage}
                  alt={`${project.name} 项目封面`}
                  width={1600}
                  height={700}
                  className="aspect-[16/7] w-full object-cover"
                  unoptimized
                />
              )}
              <div className="p-5">
                <h3 className="mb-2 text-lg font-semibold text-foreground">{project.name}</h3>
                <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">
                  {project.description}
                </p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  {project.sourceUrl && (
                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
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
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      {t("viewProjects")}
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}
