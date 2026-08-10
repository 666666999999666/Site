import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  createRegisteredOnlineMcpServer,
  type OnlineMcpToolName,
} from "../mcp/register-tools"
import type { McpToolInputMap } from "../lib/mcp/tool-schemas"

test("online tools work over stateless Streamable HTTP", async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const httpServer = createServer(async (request, response) => {
    try {
      const mcpServer = createRegisteredOnlineMcpServer(async <Name extends OnlineMcpToolName>(
        name: Name,
        input: McpToolInputMap[Name]
      ): Promise<CallToolResult> => {
        calls.push({ name, input })
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              approval_id: "approval-1",
              status: "approved",
              post_id: "post-1",
            }),
          }],
        }
      })
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      await mcpServer.connect(transport)
      await transport.handleRequest(request, response)
    } catch (error) {
      response.statusCode = 500
      response.end(error instanceof Error ? error.message : String(error))
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(0, "127.0.0.1", resolve)
  })
  const address = httpServer.address()
  assert.ok(address && typeof address === "object")

  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/api/mcp`)
  )
  const client = new Client({ name: "qz-mcp-http-test", version: "1.0.0" })

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "begin_markdown_draft_import",
        "create_category",
        "finalize_markdown_draft_import",
        "get_approval_status",
        "search_drafts",
        "todo_to_draft",
        "update_draft_metadata",
      ]
    )

    const begin = await client.callTool({
      name: "begin_markdown_draft_import",
      arguments: {
        source_file: "owner-draft.md",
        markdown: "---\ntitle: Owner draft\n---\n\nUser-authored body.",
        images: [],
      },
    })
    assert.notEqual(begin.isError, true)

    const result = await client.callTool({
      name: "get_approval_status",
      arguments: { approval_id: "approval-1" },
    })
    assert.notEqual(result.isError, true)
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1], {
      name: "get_approval_status",
      input: { approval_id: "approval-1" },
    })
  } finally {
    await client.close().catch(() => undefined)
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }
})
