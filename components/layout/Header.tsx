"use client"

import { useLocale, useTranslations } from "next-intl"
import { CatButton } from "@/components/auth/CatButton"
import { GitHubIcon } from "@/components/icons/GitHubIcon"
import { Link, usePathname } from "@/i18n/navigation"
import { MobileMenu } from "./MobileMenu"
import { ThemeToggle } from "./ThemeToggle"

export function Header({
  siteName,
  githubUrl,
}: {
  siteName: string
  githubUrl: string
}) {
  const t = useTranslations("nav")
  const locale = useLocale()
  const pathname = usePathname()
  const links = [
    { href: "/", label: t("home") },
    { href: "/blog", label: t("blog") },
    { href: "/projects", label: t("projects") },
    { href: "/about", label: t("about") },
  ]

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname === ""
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          locale={locale}
          className="max-w-48 truncate text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          {siteName}
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="主导航">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              locale={locale}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="访问 GitHub"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <GitHubIcon className="size-4" />
            </a>
          )}
          <CatButton />
          <ThemeToggle />
          <MobileMenu />
        </div>
      </div>
    </header>
  )
}
