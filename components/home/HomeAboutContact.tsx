import { getTranslations } from "next-intl/server"
import { Mail } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"
import { GitHubIcon } from "@/components/icons/GitHubIcon"

export async function HomeAboutContact({
  description,
  email,
  githubUrl,
}: {
  description: string
  email: string
  githubUrl: string
}) {
  const t = await getTranslations("home")

  return (
    <section className="border-t border-border/40 py-12 sm:py-16" aria-labelledby="home-about-heading">
      <Container size="narrow">
        <h2 id="home-about-heading" className="text-2xl font-bold">{t("aboutContact")}</h2>
        <p className="mt-3 leading-7 text-muted-foreground">{description || t("aboutContactDescription")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/about" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {t("moreAbout")}
          </Link>
          {email && (
            <a href={`mailto:${email}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <Mail className="size-4" />
              {t("emailMe")}
            </a>
          )}
          {githubUrl && (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
              <GitHubIcon className="size-4" />
              GitHub
            </a>
          )}
        </div>
      </Container>
    </section>
  )
}
