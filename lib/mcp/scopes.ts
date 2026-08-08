export const MCP_SCOPES = [
  "draft:create",
  "draft:read",
  "draft:update",
  "category:create",
  "todo:convert",
] as const

export type McpScope = typeof MCP_SCOPES[number]
