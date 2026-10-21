import { QuestionForm } from "@/components/questions/QuestionForm"
import { Container } from "@/components/layout/Container"
import { questionReturnTo } from "@/lib/questions/navigation"

export default async function EditQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { id } = await params
  const { returnTo } = await searchParams
  return (
    <Container size="wide">
      <QuestionForm mode="edit" questionId={id} returnTo={questionReturnTo(returnTo)} />
    </Container>
  )
}
