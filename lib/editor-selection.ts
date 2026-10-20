/** ProseMirror positions span 0..content.size, including atom-only documents. */
export function clampEditorSelectionPosition(position: number, contentSize: number): number {
  return Math.max(0, Math.min(position, contentSize))
}
