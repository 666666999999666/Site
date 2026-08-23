"use client"

import Link from "next/link"
import { BookOpenCheck, Library, Plus } from "lucide-react"
import { QuestionLibrary } from "@/components/questions/QuestionLibrary"
import { QuestionStudy } from "@/components/questions/QuestionStudy"
import { buttonVariants } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export function QuestionSchool() {
  return (
    <div className="animate-in fade-in space-y-7 duration-300">
      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">自己出题 · 自己审核 · 按记忆节奏复习</p>
          <h1 className="text-3xl font-semibold">问题中学</h1>
        </div>
        <Link href="/admin/questions/new" className={cn(buttonVariants(), "h-10 gap-1.5 px-4")}>
          <Plus className="size-4" /> 新建题目
        </Link>
      </header>

      <Tabs defaultValue="today" className="gap-6">
        <TabsList className="h-10 w-full justify-start sm:w-fit" aria-label="问题中学页面">
          <TabsTrigger value="today" className="h-full px-4">
            <BookOpenCheck /> 今日复习
          </TabsTrigger>
          <TabsTrigger value="library" className="h-full px-4">
            <Library /> 题库管理
          </TabsTrigger>
        </TabsList>
        <TabsContent value="today">
          <QuestionStudy />
        </TabsContent>
        <TabsContent value="library">
          <QuestionLibrary />
        </TabsContent>
      </Tabs>
    </div>
  )
}
