export const MATERIAL_STATUSES = ["STORED", "WANT_DISCUSS", "DISCUSSED", "ARCHIVED"] as const
export type MaterialStatus = typeof MATERIAL_STATUSES[number]
export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  STORED: "暂存", WANT_DISCUSS: "想讨论", DISCUSSED: "已讨论", ARCHIVED: "归档",
}
export function isMaterialStatus(value: unknown): value is MaterialStatus {
  return typeof value === "string" && MATERIAL_STATUSES.includes(value as MaterialStatus)
}
