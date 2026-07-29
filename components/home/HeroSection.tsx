"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"

export function HeroSection({
  name,
  role,
  description,
}: {
  name: string
  role: string
  description: string
}) {
  const t = useTranslations("home")
  return (
    <section className="py-24 sm:py-36">
      <Container size="narrow">
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {name}
          </h1>
          <p className="mb-3 text-base font-medium text-foreground/80">{role}</p>
          <p className="mb-8 text-lg text-muted-foreground">
            {description}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-lg h-9 px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t("readBlog")}
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center justify-center border border-border bg-background hover:bg-muted rounded-lg h-9 px-4 text-sm font-medium transition-colors"
            >
              {t("viewProjects")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  )
}
