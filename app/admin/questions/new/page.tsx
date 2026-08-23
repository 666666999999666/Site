import { QuestionForm } from "@/components/questions/QuestionForm"
import { Container } from "@/components/layout/Container"

export default function NewQuestionPage() {
  return (
    <Container size="wide">
      <QuestionForm mode="create" />
    </Container>
  )
}
