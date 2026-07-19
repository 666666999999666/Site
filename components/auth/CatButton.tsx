"use client"

import { useState, useEffect } from "react"
import { Cat } from "lucide-react"
import { motion } from "motion/react"
import { LoginDialog } from "./LoginDialog"
import { useRouter } from "next/navigation"

export function CatButton() {
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => setLoggedIn(d.isLoggedIn))
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
      <motion.button
        onClick={handleClick}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-white/60 backdrop-blur-sm border border-line flex items-center justify-center text-ink-muted hover:text-accent hover:bg-white transition-colors"
        whileHover={{ y: -4, scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="管理入口"
        title="喵~"
      >
        <Cat className="h-5 w-5" />
      </motion.button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
