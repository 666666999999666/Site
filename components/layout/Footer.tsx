"use client"

import { useTranslations } from "next-intl"
import { Container } from "./Container"
import { useEffect, useState } from "react"

export function Footer() {
  const t = useTranslations("footer")
  const [ownerName, setOwnerName] = useState("")
  useEffect(() => {
    fetch("/api/settings?keys=owner_name")
      .then((r) => r.json())
      .then((d) => setOwnerName(d.owner_name || ""))
      .catch(() => {})
  }, [])
  return (
    <footer className="py-8 border-t border-border/50 mt-20">
      <Container>
        <p className="text-center text-sm text-muted-foreground">
          {t("copyright", { year: new Date().getFullYear(), name: ownerName || "QZ Site" })}
        </p>
      </Container>
    </footer>
  )
}
