"use client"

import { useState } from "react"
import type { Category } from "@/lib/generated/prisma/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"

type CategoryItem = { categoryId: string | null; category: Category | null }

// Keep selection and remembered-category policy in each resource's component.
export function reconcileCategoryItems<T extends CategoryItem>(items: T[], id: string, category: Category | null): T[] {
  return items.map((item) => item.categoryId === id
    ? { ...item, category, ...(category ? {} : { categoryId: null }) }
    : item)
}

export function useCategories(initialCategories: Category[], type: "BLOG" | "TODO") {
  const [categories, setCategories] = useState(initialCategories)

  async function createCategory(name: string) {
    const category = await apiRequest<Category>("/api/categories", jsonRequest("POST", {
      name,
      type,
      sortOrder: (categories.at(-1)?.sortOrder ?? -10) + 10,
    }))
    setCategories((current) => [...current, category].sort((a, b) => a.sortOrder - b.sortOrder))
    return category
  }

  async function updateCategory(id: string, input: { name: string; sortOrder: number }) {
    const category = await apiRequest<Category>(`/api/categories/${id}`, jsonRequest("PATCH", input))
    setCategories((current) => current
      .map((item) => item.id === id ? category : item)
      .sort((a, b) => a.sortOrder - b.sortOrder))
    return category
  }

  async function deleteCategory(id: string) {
    await apiRequest(`/api/categories/${id}`, { method: "DELETE" })
    setCategories((current) => current.filter((item) => item.id !== id))
  }

  return { categories, createCategory, updateCategory, deleteCategory }
}
