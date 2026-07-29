import type { Metadata } from "next"
import { Mail } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Container } from "@/components/layout/Container"
import { getPublicSettings } from "@/lib/settings"
import { GitHubIcon } from "@/components/icons/GitHubIcon"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "about" })
  const pathname = `/${locale}/about`

  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
    alternates: {
      canonical: pathname,
      languages: { zh: "/zh/about", en: "/en/about" },
    },
    openGraph: {
      title: t("metadataTitle"),
      description: t("metadataDescription"),
      url: pathname,
      locale: locale === "en" ? "en_US" : "zh_CN",
    },
  }
}

export default async function AboutPage() {
  const t = await getTranslations("about")
  const settings = await getPublicSettings()
  const skills = settings.about_skills
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)

  return (
    <section className="py-16">
      <Container>
        <div className="mb-10 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">
            {settings.about_intro || t("description")}
          </p>
        </div>

        <div className="max-w-3xl space-y-10">
          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("whatIDo")}
            </h2>
            <p className="mt-3 whitespace-pre-line leading-7 text-muted-foreground">
              {settings.about_whatido || settings.home_role}
            </p>
          </section>

          {skills.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {t("techStack")}
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("contact")}
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {settings.about_github && (
                <a
                  href={settings.about_github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <GitHubIcon className="size-5" />
                  GitHub
                </a>
              )}
              {settings.email && (
                <a
                  href={`mailto:${settings.email}`}
                  className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Mail className="size-5" />
                  {settings.email}
                </a>
              )}
            </div>
          </section>
        </div>
      </Container>
    </section>
  )
}
