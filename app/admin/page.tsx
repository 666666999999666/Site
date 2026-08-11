import { ensureAuthenticated } from "@/lib/api/auth"
import { getDailyDashboard } from "@/lib/daily"
import { DailyTopThree } from "@/components/admin/DailyTopThree"
import { Container } from "@/components/layout/Container"

export default async function DailyTopThreePage() {
  const session = await ensureAuthenticated()
  const dashboard = await getDailyDashboard(session.userId)

  return (
    <Container size="wide" className="max-w-6xl">
      <DailyTopThree initialDashboard={dashboard} />
    </Container>
  )
}
