import "dotenv/config"
import { fileURLToPath } from "url"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { loadMcpRuntimeConfig } from "../lib/mcp/config"

process.chdir(fileURLToPath(new URL("../", import.meta.url)))

async function main() {
  const config = loadMcpRuntimeConfig()
  let disconnect: () => Promise<void> = async () => {}
  let server

  if (config.remoteUrl) {
    const { createRemoteBlogMcpServer, verifyRemoteGateway } = await import("./remote-tools")
    await verifyRemoteGateway(config)
    server = createRemoteBlogMcpServer(config)
  } else {
    const [tools, credentials, rateLimits, database] = await Promise.all([
      import("./tools"),
      import("../lib/mcp/credential-service"),
      import("../lib/mcp/rate-limit-service"),
      import("../lib/db"),
    ])
    await credentials.authenticateMcpCredential(config.credential)
    await rateLimits.cleanupMcpRateLimits()
    disconnect = database.disconnectDatabase
    server = tools.createBlogMcpServer(config)
  }

  const transport = new StdioServerTransport()

  const shutdown = async () => {
    await server.close()
    await disconnect()
    process.exit(0)
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  await server.connect(transport)
  console.error("QZ Blog MCP Server running on stdio")
}

main().catch((error) => {
  console.error("QZ Blog MCP Server failed to start:", error instanceof Error ? error.message : error)
  process.exit(1)
})
