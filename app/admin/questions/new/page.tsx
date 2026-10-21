import { QuestionForm } from "@/components/questions/QuestionForm"
import { Container } from "@/components/layout/Container"
import { questionReturnTo } from "@/lib/questions/navigation"

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { returnTo } = await searchParams
  return (
    <Container size="wide">
      <QuestionForm mode="create" returnTo={questionReturnTo(returnTo)} />
    </Container>
  )
}
