import assert from "node:assert/strict"
import test from "node:test"
import * as nextServer from "next/server"
import * as errors from "../lib/errors"
import * as adminMutation from "../lib/api/admin-mutation"
import * as privateResponse from "../lib/api/private-response"
import * as validation from "../lib/validation"
import * as todosPolicy from "../lib/todos-policy"
import * as shared from "../app/api/todos/_shared"
import { loadRoute } from "./helpers/load-route"

type Include = ReturnType<typeof shared.todoIncludeForOwner>
type Query = { include: Include; where: Record<string, unknown> }
const conversions = [
  { ownerId: "alice", idea: { id: "alice-private-id", title: "Alice private material" } },
  { ownerId: "bob", idea: { id: "bob-private-id", title: "Bob private material" } },
]

for (const ownerId of ["alice", "bob"]) {
  for (const route of ["todos", "todos/[id]"]) {
    test(`${ownerId} ${route} read keeps shared Todo but only its owner's private material backlink`, async () => {
      let seen: Query | undefined
      function project(query: Query) {
        seen = query
        assert.deepEqual(query.include.ideaConversions.where, { ownerId })
        return {
          id: "shared-todo", title: "Shared site Todo",
          ideaConversions: conversions.filter((item) => item.ownerId === query.include.ideaConversions.where.ownerId)
            .map(({ idea }) => ({ idea })),
        }
      }
      const handlers = loadRoute<{ GET: (request: nextServer.NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(`app/api/${route}/route.ts`, {
        "next/server": nextServer,
        "@/lib/api/auth": { ensureAuthenticated: async () => ({ userId: ownerId }) },
        "@/lib/api/admin-mutation": adminMutation,
        "@/lib/api/private-response": privateResponse,
        "@/lib/errors": errors,
        "@/lib/validation": validation,
        "@/lib/todos-policy": todosPolicy,
        "@/lib/db": { prisma: { todo: { findMany: async (query: Query) => [project(query)], findUnique: async (query: Query) => project(query) } } },
        "./_shared": shared,
        "../_shared": shared,
      })
      const response = await handlers.GET(new nextServer.NextRequest(`https://example.test/api/${route}?status=PAUSED&q=keep`), { params: Promise.resolve({ id: "shared-todo" }) })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("Cache-Control"), "private, no-store")
      const body = await response.json()
      const todo = Array.isArray(body) ? body[0] : body
      assert.equal(todo.id, "shared-todo")
      assert.deepEqual(todo.ideaConversions, [{ idea: conversions.find((item) => item.ownerId === ownerId)!.idea }])
      assert.equal(JSON.stringify(body).includes(ownerId === "alice" ? "Bob private material" : "Alice private material"), false)
      assert.equal(JSON.stringify(body).includes(ownerId === "alice" ? "bob-private-id" : "alice-private-id"), false)
      if (route === "todos") {
        assert.equal(seen?.where.status, "PAUSED")
        assert.deepEqual(seen?.where.OR, [{ title: { contains: "keep", mode: "insensitive" } }, { description: { contains: "keep", mode: "insensitive" } }])
      }
    })
  }
}

test("the default include never exposes private Idea metadata without owner context", () => {
  assert.equal("ideaConversions" in shared.todoInclude, false)
})
