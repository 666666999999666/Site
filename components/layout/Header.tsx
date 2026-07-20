import Link from "next/link"
import { Container } from "./Container"

export function Header() {
  return (
    <header className="py-8 border-b border-line">
      <Container>
        <nav className="flex items-center justify-between">
          <Link href="/" className="font-serif text-xl text-ink hover:text-accent transition-colors">
            数字花园
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/blog" className="text-ink-muted hover:text-accent transition-colors">文章</Link>
            <a href={process.env.NEXT_PUBLIC_GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-accent transition-colors">GitHub</a>
          </div>
        </nav>
      </Container>
    </header>
  )
}
