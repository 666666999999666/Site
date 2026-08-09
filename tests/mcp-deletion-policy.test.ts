import assert from "node:assert/strict"
import test from "node:test"
import {
  approvalDeletionBlockReason,
  auditDeletionBlockReason,
  credentialDeletionBlockReason,
} from "../lib/mcp/deletion-policy"

test("credential deletion requires revocation and no approval history", () => {
  assert.match(credentialDeletionBlockReason({ revokedAt: null, approvalCount: 0 })!, /撤销/)
  assert.match(credentialDeletionBlockReason({ revokedAt: new Date(), approvalCount: 2 })!, /2 条审批/)
  assert.equal(credentialDeletionBlockReason({ revokedAt: new Date(), approvalCount: 0 }), null)
})

test("approval deletion only accepts terminal non-processing records", () => {
  assert.match(approvalDeletionBlockReason({ status: "PENDING_APPROVAL", processingAt: null })!, /先批准或拒绝/)
  assert.match(approvalDeletionBlockReason({ status: "APPROVED", processingAt: new Date() })!, /正在执行/)
  assert.equal(approvalDeletionBlockReason({ status: "APPROVED", processingAt: null }), null)
  assert.equal(approvalDeletionBlockReason({ status: "REJECTED", processingAt: null }), null)
})

test("audit deletion rejects active records", () => {
  assert.match(auditDeletionBlockReason("IN_PROGRESS")!, /执行中/)
  assert.equal(auditDeletionBlockReason("SUCCESS"), null)
  assert.equal(auditDeletionBlockReason("FAILURE"), null)
  assert.equal(auditDeletionBlockReason("INTERRUPTED"), null)
})
