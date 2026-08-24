export interface PublicProjectEvidence {
  title: string
  description: string | null
  tags: string[]
  sourceUrl: string | null
  demoUrl: string | null
}

function isVerifiableWebUrl(value: string | null): boolean {
  if (!value) return false
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function hasPublicProjectEvidence(project: PublicProjectEvidence): boolean {
  return project.title.trim() !== "" &&
    Boolean(project.description?.trim()) &&
    (isVerifiableWebUrl(project.sourceUrl) || isVerifiableWebUrl(project.demoUrl))
}
