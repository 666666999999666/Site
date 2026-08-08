import "dotenv/config"
import { fileURLToPath } from "url"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { disconnectDatabase } from "../lib/db"
import { loadMcpRuntimeConfig } from "../lib/mcp/config"
import { authenticateMcpCredential } from "../lib/mcp/credential-service"
import { cleanupMcpRateLimits } from "../lib/mcp/rate-limit-service"
import { createBlogMcpServer } from "./tools"

process.chdir(fileURLToPath(new URL("../", import.meta.url)))

async function main() {
  const config = loadMcpRuntimeConfig()
  await authenticateMcpCredential(config.credential)
  await cleanupMcpRateLimits()

  const server = createBlogMcpServer(config)
  const transport = new StdioServerTransport()

  const shutdown = async () => {
    await server.close()
    await disconnectDatabase()
    process.exit(0)
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  await server.connect(transport)
  console.error("QZ Blog MCP Server running on stdio")
}

main().catch(async (error) => {
  console.error("QZ Blog MCP Server failed to start:", error instanceof Error ? error.message : error)
  await disconnectDatabase().catch(() => undefined)
  process.exit(1)
})
