export function decodeRouteSegment(segment: string): string {
  if (!segment.includes("%")) return segment

  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
