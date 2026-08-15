export type InboxKindValue = "BLOG" | "IDEA" | "TODO"
export type InboxStatusValue = "RECEIVED" | "APPLIED" | "FAILED"

export interface InboxExecutionView {
  targetType: InboxKindValue
  targetId: string
  targetHref: string
  createdAt: string
}

export interface InboxEventView {
  id: string
  eventType: string
  metadata: unknown
  createdAt: string
}

export interface InboxItemSummaryView {
  id: string
  kind: InboxKindValue
  status: InboxStatusValue
  failureCode: string | null
  failureMessage: string | null
  createdAt: string
  appliedAt: string | null
  updatedAt: string
  execution: InboxExecutionView | null
}

export interface InboxItemView extends InboxItemSummaryView {
  rawInput: string
  rawSha256: string
  parsedBody: string
  parserVersion: number
  requestKey: string
  events: InboxEventView[]
}

type DateLike = Date | string

interface InboxItemRecord {
  id: string
  kind: InboxKindValue
  status: InboxStatusValue
  rawInput: string
  rawSha256: string
  parsedBody: string
  parserVersion: number
  requestKey: string
  failureCode: string | null
  failureMessage: string | null
  createdAt: DateLike
  appliedAt: DateLike | null
  updatedAt: DateLike
  execution?: {
    targetType: InboxKindValue
    targetId: string
    createdAt: DateLike
  } | null
  events?: Array<{
    id: string
    eventType: string
    metadata: unknown
    createdAt: DateLike
  }>
}

interface InboxItemSummaryRecord {
  id: string
  kind: InboxKindValue
  status: InboxStatusValue
  failureCode: string | null
  failureMessage: string | null
  createdAt: DateLike
  appliedAt: DateLike | null
  updatedAt: DateLike
  execution?: {
    targetType: InboxKindValue
    targetId: string
    createdAt: DateLike
  } | null
}

function toIsoString(value: DateLike): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function getInboxTargetHref(targetType: InboxKindValue, targetId: string): string {
  const encodedId = encodeURIComponent(targetId)
  if (targetType === "BLOG") return `/admin/posts/${encodedId}`
  if (targetType === "IDEA") return `/admin/ideas/${encodedId}`
  return `/admin/todos#todo-${encodedId}`
}

export function serializeInboxSummary(item: InboxItemSummaryRecord): InboxItemSummaryView {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status,
    failureCode: item.failureCode,
    failureMessage: item.failureMessage,
    createdAt: toIsoString(item.createdAt),
    appliedAt: item.appliedAt ? toIsoString(item.appliedAt) : null,
    updatedAt: toIsoString(item.updatedAt),
    execution: item.execution
      ? {
          targetType: item.execution.targetType,
          targetId: item.execution.targetId,
          targetHref: getInboxTargetHref(item.execution.targetType, item.execution.targetId),
          createdAt: toIsoString(item.execution.createdAt),
        }
      : null,
  }
}

export function serializeInboxItem(item: InboxItemRecord): InboxItemView {
  return {
    ...serializeInboxSummary(item),
    rawInput: item.rawInput,
    rawSha256: item.rawSha256,
    parsedBody: item.parsedBody,
    parserVersion: item.parserVersion,
    requestKey: item.requestKey,
    events: (item.events ?? []).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      metadata: event.metadata,
      createdAt: toIsoString(event.createdAt),
    })),
  }
}
