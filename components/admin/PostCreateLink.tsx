"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { postDocumentHref, postListHref, readPostListFilters } from "@/lib/post-list-navigation"

/** The existing create action follows filters applied with native History API. */
export function PostCreateLink() {
  const params = useSearchParams()
  const href = postDocumentHref("new", postListHref(readPostListFilters(params)))
  return (
    <Link href={href} className={cn(buttonVariants(), "gap-1.5")}>
      <Plus className="size-4" /> 新文章
    </Link>
  )
}
