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
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] z-40 inline-flex size-12 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-lg backdrop-blur-md transition-[color,background-color,border-color,transform] hover:-translate-y-0.5 hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("label")}
        title={loggedIn ? t("openAdmin") : t("login")}
      >
        <Cat className="size-5" />
      </button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
