"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { BookOpenCheck, Library, Plus } from "lucide-react"
import { QuestionLibrary } from "@/components/questions/QuestionLibrary"
import { QuestionStudy } from "@/components/questions/QuestionStudy"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { questionNewURL, questionPageURL, readQuestionNavigation, type QuestionNavigation } from "@/lib/questions/navigation"

function QuestionSchoolContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const navigation = readQuestionNavigation(searchParams)
  const navigate = (next: QuestionNavigation) => router.push(questionPageURL(next), { scroll: false })
  return (
    <div className="animate-in fade-in space-y-7 duration-300">
      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">可以只浏览，也可以按需评分复习</p>
          <h1 className="text-3xl font-semibold">问题中学</h1>
        </div>
        <Link href={questionNewURL(questionPageURL(navigation))} className={cn(buttonVariants(), "h-10 gap-1.5 px-4")}>
          <Plus className="size-4" /> 新建题目
        </Link>
      </header>

      <Tabs value={navigation.tab} onValueChange={value => navigate({ ...navigation, tab: value === "library" ? "library" : "today" })} className="gap-6">
        <TabsList className="h-10 w-full justify-start sm:w-fit" aria-label="问题中学页面">
          <TabsTrigger value="today" className="h-full px-4">
            <BookOpenCheck /> 今日复习
          </TabsTrigger>
          <TabsTrigger value="library" className="h-full px-4">
            <Library /> 浏览题库
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <QuestionStudy />
        </TabsContent>
        <TabsContent value="library">
          <QuestionLibrary navigation={navigation} onNavigate={navigate} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function QuestionSchool() {
  return <Suspense fallback={<p role="status">正在读取问题中学页面…</p>}><QuestionSchoolContent /></Suspense>
}
