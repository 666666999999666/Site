import { QuestionLibrary } from "@/components/questions/QuestionLibrary"

export default function QuestionLibraryHarnessPage() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-10">
      <QuestionLibrary />
      <label className="mt-8 block space-y-2">
        <span>原生下拉框主题验收</span>
        <select
          aria-label="原生下拉框主题验收"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-foreground"
          defaultValue="pending"
        >
          <option value="ready">全部就绪</option>
          <option value="pending">待补答案</option>
          <option value="disabled">已停用</option>
        </select>
      </label>
    </div>
  )
}
