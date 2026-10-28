import { QuickCapture } from "@/components/admin/QuickCapture"
import { QuestionBrowse } from "@/components/questions/QuestionBrowse"

export default async function CaptureBrowseHarness({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  return <main className="mx-auto max-w-4xl p-4 sm:p-8">
    {view === "question"
      ? <QuestionBrowse questionId="browse-fixture" returnTo="/admin/questions?tab=library" />
      : <QuickCapture ownerId="capture-fixture-owner" />}
  </main>
}
