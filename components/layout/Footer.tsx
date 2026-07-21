"use client"

import { useTranslations } from "next-intl"
import { Container } from "./Container"

export function Footer() {
  const t = useTranslations("footer")
  return (
    <footer className="py-8 border-t border-border/50 mt-20">
      <Container>
        <p className="text-center text-sm text-muted-foreground">
          {t("copyright", { year: new Date().getFullYear() })}
        </p>
      </Container>
    </footer>
  )
}
