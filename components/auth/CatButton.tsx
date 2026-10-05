"use client"

import { useState, useEffect } from "react"
import { Cat } from "lucide-react"
import { useTranslations } from "next-intl"
import { LoginDialog } from "./LoginDialog"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api-client"

export function CatButton() {
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const router = useRouter()
  const t = useTranslations("adminEntry")

  useEffect(() => {
    apiRequest<{ isLoggedIn: boolean }>("/api/auth/check")
      .then((data) => setLoggedIn(data.isLoggedIn))
      .catch(() => setLoggedIn(false))
  }, [])

  function handleClick() {
    if (loggedIn) {
      router.push("/admin")
    } else {
      setOpen(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("label")}
        title={loggedIn ? t("openAdmin") : t("login")}
      >
        <Cat className="size-4" />
      </button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
