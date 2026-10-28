/** A compact homepage preview; the original description remains on the series page. */
export function conciseSeriesDescription(description: string, maxCharacters = 80): string {
  const normalized = description.replace(/\s+/gu, " ").trim()
  if (!normalized) return ""
  const firstSentence = normalized.match(/^.*?[。！？!?]/u)?.[0]?.trim() ?? normalized
  const characters = Array.from(firstSentence)
  return characters.length <= maxCharacters ? firstSentence : characters.slice(0, maxCharacters).join("") + "…"
}
