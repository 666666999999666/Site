import { ensureAuthenticated } from "@/lib/api/auth"
import { listDailyQuotes } from "@/lib/daily"
import { Container } from "@/components/layout/Container"
import { DailyQuoteManager } from "@/components/admin/DailyQuoteManager"

export default async function DailyQuotesPage() {
  await ensureAuthenticated()
  const quotes = await listDailyQuotes({
    page: 1,
    pageSize: 20,
    status: "all",
    query: "",
  })

  return (
    <Container size="wide">
      <DailyQuoteManager initialData={quotes} />
    </Container>
  )
}
