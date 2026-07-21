"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Container } from "@/components/layout/Container"

export function HeroSection({ description }: { description?: string }) {
  const t = useTranslations("home")
  return (
    <section className="py-24 sm:py-36">
      <Container size="narrow">
        <div className="text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground mb-4">
            {t("title")}
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            {description || t("description")}
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
