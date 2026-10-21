import Link from "next/link"
import { Container } from "@/components/layout/Container"
import { HistoricalImageBackfill } from "@/components/admin/HistoricalImageBackfill"

export default function HistoricalImageVariantsPage() {
  return (
    <Container>
      <Link href="/admin/settings" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">返回设置</Link>
      <h1 className="mb-6 text-2xl font-semibold sm:text-3xl">历史六图响应式补齐</h1>
      <HistoricalImageBackfill />
    </Container>
  )
}
