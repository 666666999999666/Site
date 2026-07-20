import { Container } from "@/components/layout/Container"
import { Mail } from "lucide-react"

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.95 10.95 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.69.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.15 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}

export function ContactSection({ githubUrl, email }: { githubUrl: string; email?: string }) {
  return (
    <section className="py-16">
      <Container size="narrow">
        <div className="flex flex-col items-center gap-4">
          <h2 className="text-2xl font-serif text-ink">联系</h2>
          <div className="flex items-center gap-6">
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-ink-muted hover:text-accent transition-colors">
              <GithubIcon className="h-5 w-5" /> GitHub
            </a>
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 text-ink-muted hover:text-accent transition-colors">
                <Mail className="h-5 w-5" /> Email
              </a>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
