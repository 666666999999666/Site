"use client"

import { useState } from "react"
import { PostsList } from "@/components/admin/PostsList"
import { TodoList } from "@/components/admin/TodoList"
import { QuestionForm } from "@/components/questions/QuestionForm"
import type { Category, Post, Todo } from "@/lib/generated/prisma/client"

const categories = [
  { id: "category-a", name: "Alpha", sortOrder: 0, color: null },
  { id: "category-b", name: "Beta", sortOrder: 10, color: null },
] as Category[]
const date = new Date("2026-10-20T00:00:00Z")
const posts = categories.map((category) => ({
  id: `post-${category.id}`, title: `Post ${category.name}`, categoryId: category.id,
  category, series: null, seriesId: null, seriesOrder: null, status: "DRAFT", updatedAt: date,
})) as (Post & { category: Category | null; series: null })[]
const todos = categories.map((category) => ({
  id: `todo-${category.id}`, title: `Todo ${category.name}`, categoryId: category.id,
  category, project: null, projectId: null, subtasks: [], status: "TODO",
  createdAt: date, updatedAt: date, description: null, completionCriteria: null,
  dueDate: null, priority: 0,
})) as (Todo & { category: Category | null; project: null; subtasks: [] })[]

export default function AdminRefactorHarness() {
  const [kind, setKind] = useState<"BLOG" | "TODO" | "QUESTIONS">("BLOG")
  const [questionId, setQuestionId] = useState("question-a")
  return (
    <main className="p-4">
      <nav aria-label="Harness controls" className="mb-6 flex gap-4">
        <button onClick={() => setKind("BLOG")}>Show BLOG</button>
        <button onClick={() => setKind("TODO")}>Show TODO</button>
        <button onClick={() => setKind("QUESTIONS")}>Show questions</button>
        <button onClick={() => setQuestionId("question-b")}>Switch question</button>
      </nav>
      {kind === "BLOG" && <PostsList initialPosts={posts} categories={categories} series={[]} />}
      {kind === "TODO" && <TodoList todos={todos} categories={categories} projects={[]} />}
      {kind === "QUESTIONS" && <QuestionForm mode="edit" questionId={questionId} />}
    </main>
  )
}
