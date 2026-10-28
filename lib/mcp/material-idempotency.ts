import { createHash } from "node:crypto"

/** Order-independent payload comparison; array order remains significant. */
export function canonicalMcpPayload(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalMcpPayload).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalMcpPayload(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export function materialApprovalId(credentialId: string, toolName: string, requestKey: string) {
  return "material_" + createHash("sha256")
    .update(JSON.stringify([credentialId, toolName, requestKey])).digest("hex")
}
