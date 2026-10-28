import { QuestionBrowse } from "@/components/questions/QuestionBrowse"
import { QuestionForm } from "@/components/questions/QuestionForm"
import { Container } from "@/components/layout/Container"
import { questionReturnTo } from "@/lib/questions/navigation"

export default async function EditQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[]; view?: string | string[] }> }) {
  const { id } = await params
  const { returnTo, view } = await searchParams
  return (
    <Container size="wide">
      {view === "read"
        ? <QuestionBrowse key={id} questionId={id} returnTo={questionReturnTo(returnTo)} />
        : <QuestionForm mode="edit" questionId={id} returnTo={questionReturnTo(returnTo)} />}
    </Container>
  )
}
