"use client"

import { useTranslations } from "next-intl"
import { Container } from "./Container"

export function Footer({ ownerName }: { ownerName: string }) {
  const t = useTranslations("footer")
  return (
    <footer className="py-8 border-t border-border/50 mt-20">
      <Container>
        <p className="text-center text-sm text-muted-foreground">
          {t("copyright", { year: new Date().getFullYear(), name: ownerName })}
        </p>
        <p className="text-center text-sm text-muted-foreground mt-1">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
          >
            豫ICP备2026034998号
          </a>
        </p>
      </Container>
    </footer>
  )
}
