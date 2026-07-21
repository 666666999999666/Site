import { getTranslations } from "next-intl/server"
import { Container } from "@/components/layout/Container"
import { ExternalLink } from "lucide-react"
import { getAllProjects } from "@/lib/projects"

export const dynamic = "force-dynamic"
export const revalidate = 3600

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const t = await getTranslations("projects")
  const projects = await getAllProjects()

  return (
    <section className="py-16">
      <Container>
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("description")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {projects.map((project) => (
            <article
              key={project.id}
              className="group rounded-lg border border-border/50 p-6 transition-all hover:border-border hover:bg-muted/30"
            >
              <h2 className="text-lg font-semibold text-foreground group-hover:text-foreground/80 transition-colors">
                {project.title}
              </h2>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                {project.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-4">
                {project.sourceUrl && (
                  <a
                    href={project.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                    <span className="text-sm">{t("source")}</span>
                  </a>
                )}
                {project.demoUrl && (
                  <a
                    href={project.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                    <span className="text-sm">{t("demo")}</span>
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
