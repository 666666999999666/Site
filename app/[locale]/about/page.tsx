import { getTranslations } from "next-intl/server"
import { Container } from "@/components/layout/Container"
import { prisma } from "@/lib/db"

export default async function AboutPage() {
  const t = await getTranslations("about")

  const keys = ["about_intro", "about_whatido", "about_skills", "about_github", "email"]
  const settings = await prisma.setting.findMany({ where: { key: { in: keys } } })
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value

  const intro = map.about_intro || ""
  const whatIDo = map.about_whatido || ""
  const skills = map.about_skills
    ? map.about_skills.split(",").map((s) => s.trim()).filter(Boolean)
    : []
  const github = map.about_github || ""
  const email = map.email || ""

  return (
    <section className="py-16">
      <Container>
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-2">{intro || t("description")}</p>
        </div>

        <div className="space-y-10">
          {/* What I Do */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("whatIDo")}
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              {whatIDo || intro || t("description")}
            </p>
          </div>

          {/* Tech Stack */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("techStack")}
            </h2>
            <div className="flex flex-wrap gap-2 mt-4">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/80"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("contact")}
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {github && (
                <a
                  href={github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
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
                  <span>GitHub</span>
                </a>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span>{email}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
