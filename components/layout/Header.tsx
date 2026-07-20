import Link from "next/link"
import { Container } from "./Container"
import { ThemeToggle } from "./ThemeToggle"

export function Header() {
  return (
    <header className="py-8 border-b border-line">
      <Container>
        <nav className="flex items-center justify-between">
          <Link href="/" className="font-serif text-xl text-ink hover:text-accent transition-colors">
            QZ Site
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/blog" className="text-ink-muted hover:text-accent transition-colors">文章</Link>
            <a href={process.env.NEXT_PUBLIC_GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-accent transition-colors">GitHub</a>
            <ThemeToggle />
          </div>
        </nav>
      </Container>
    </header>
  )
}
