import "dotenv/config"
import { fileURLToPath } from "url"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ConfigurationError } from "../lib/errors"
import { loadMcpRuntimeConfig } from "../lib/mcp/config"

process.chdir(fileURLToPath(new URL("../", import.meta.url)))

async function main() {
  const config = loadMcpRuntimeConfig()
  if (!config.remoteUrl) {
    throw new ConfigurationError("本地 Markdown 导入需要配置 MCP_REMOTE_URL")
  }
  const { createMarkdownImportMcpServer, verifyRemoteGateway } = await import("./remote-tools")
  await verifyRemoteGateway(config)
  const server = createMarkdownImportMcpServer(config)

  const transport = new StdioServerTransport()

  const shutdown = async () => {
    await server.close()
    process.exit(0)
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  await server.connect(transport)
  console.error("QZ Blog local Markdown import MCP running on stdio")
}

main().catch((error) => {
  console.error("QZ Blog MCP Server failed to start:", error instanceof Error ? error.message : error)
  process.exit(1)
})
