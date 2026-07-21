import { ProjectForm } from "@/components/admin/ProjectForm"
import { Container } from "@/components/layout/Container"

export default async function NewProjectPage() {
  return (
    <Container>
      <h1 className="text-3xl font-semibold mb-8">新建项目</h1>
      <ProjectForm />
    </Container>
  )
}
