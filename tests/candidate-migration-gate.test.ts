import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("predeploy migration validation is isolated, idempotent, and cleanup-safe", () => {
  const gate = readFileSync("ops/verify-candidate-migration.sh", "utf8")

  assert.match(gate, /postgres:16-alpine@sha256:[0-9a-f]{64}/)
  assert.match(gate, /docker network create --internal/)
  assert.match(gate, /--tmpfs \/var\/lib\/postgresql\/data/)
  assert.match(gate, /--pull never/)
  assert.match(gate, /--read-only/)
  assert.match(gate, /run_candidate_migration[\s\S]*?run_candidate_migration/)
  assert.match(gate, /protected production row counts/)
  assert.match(gate, /trap cleanup EXIT/)
  assert.match(gate, /docker rm --force "\$pg_container"/)
  assert.match(gate, /docker network rm "\$network"/)
  assert.doesNotMatch(gate, /--publish|--network host|docker system prune/)
})
