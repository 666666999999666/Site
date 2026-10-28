export const MCP_SCOPES = [
  "draft:import",
  "draft:read",
  "draft:update",
  "category:create",
  "todo:convert",
  "material:read",
  "material:write",
  "material:convert",
] as const

export type McpScope = typeof MCP_SCOPES[number]
