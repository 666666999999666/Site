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
    <section className="border-b border-border/40 py-14 sm:py-20">
      <Container size="narrow">
        <div className="text-center">
          <p className="mb-3 text-sm font-medium text-muted-foreground">{name} · {role}</p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
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
