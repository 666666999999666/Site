import { QuestionForm } from "@/components/questions/QuestionForm"
import { Container } from "@/components/layout/Container"

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Container size="wide">
      <QuestionForm mode="edit" questionId={id} />
    </Container>
  )
}
