import { Container } from "./Container"

export function Footer() {
  return (
    <footer className="py-8 border-t border-line mt-20">
      <Container>
        <p className="text-center text-sm text-ink-muted">
          © {new Date().getFullYear()} 数字花园 · 写字是和自己的对话
        </p>
      </Container>
    </footer>
  )
}
