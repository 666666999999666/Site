"use client"

import { useState, useEffect } from "react"
import { Cat } from "lucide-react"
import { LoginDialog } from "./LoginDialog"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api-client"

export function CatButton() {
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const router = useRouter()

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
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="管理入口"
        title={loggedIn ? "进入后台" : "管理登录"}
      >
        <Cat className="size-4" />
      </button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
