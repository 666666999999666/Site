import { ValidationError } from "./errors"

export function nextSeriesOrderFromMax(maxOrder: number | null): number {
  const next = (maxOrder ?? -1) + 1
  if (next > 10_000) throw new ValidationError("系列顺序已达到上限，请先重新排序")
  return next
}

export function seriesDisplayPosition(sequenceIndex: number): number {
  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw new ValidationError("系列显示位置无效")
  }
  return sequenceIndex + 1
}
