export function hasNoUploadReferences(counts: {
  postCount: number
  projectCount: number
  seriesCount: number
}): boolean {
  return counts.postCount === 0 && counts.projectCount === 0 && counts.seriesCount === 0
}
