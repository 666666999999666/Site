import type { MaterialStatus } from "@/lib/material-status"

type IdeaDraftSource = {
  title: string
  content: string
  tags: string[]
  projects: { id: string }[]
  discussionStatus?: MaterialStatus
  discussionSummary?: string | null
}

export type IdeaDraft = { title: string; content: string; tags: string; projectIds: string[]; discussionStatus?: MaterialStatus; discussionSummary?: string }
export function draftFromIdea(idea?: IdeaDraftSource): IdeaDraft {
  return {
    discussionStatus: idea?.discussionStatus ?? "STORED",
    discussionSummary: idea?.discussionSummary ?? "",
    title: idea?.title ?? "",
    content: idea?.content ?? "",
    tags: (idea?.tags ?? []).join(", "),
    projectIds: (idea?.projects.map((project) => project.id) ?? []).sort(),
  }
}

// Ideas deliberately retain the existing comma-only parsing, unlike public post tags.
export function ideaDraftTags(tags: string): string[] {
  return tags.split(",").map((tag) => tag.trim()).filter(Boolean)
}

export function ideaMutationInput(data: IdeaDraft, baseline: IdeaDraft, existing: boolean) {
  const allFields = {
    title: data.title, content: data.content,
    tags: ideaDraftTags(data.tags),
    projectIds: data.projectIds,
    ...(data.discussionStatus !== undefined ? { discussionStatus: data.discussionStatus } : {}),
    ...(data.discussionSummary !== undefined ? { discussionSummary: data.discussionSummary || null } : {}),
  }
  const body = existing
    ? Object.fromEntries(Object.entries(allFields).filter(([key]) => (
      key === "projectIds"
        ? data.projectIds.join("\0") !== baseline.projectIds.join("\0")
        : data[key as "title" | "content" | "tags" | "discussionStatus" | "discussionSummary"] !== baseline[key as "title" | "content" | "tags" | "discussionStatus" | "discussionSummary"]
    )))
    : allFields
  return body
}
