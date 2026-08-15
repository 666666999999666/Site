import assert from "node:assert/strict"
import test from "node:test"
import { isInboxEnabled } from "../lib/inbox-feature"

function withInboxFlag(value: string | undefined, assertion: () => void) {
  const previous = process.env.INBOX_ENABLED

  if (value === undefined) {
    delete process.env.INBOX_ENABLED
  } else {
    process.env.INBOX_ENABLED = value
  }

  try {
    assertion()
  } finally {
    if (previous === undefined) {
      delete process.env.INBOX_ENABLED
    } else {
      process.env.INBOX_ENABLED = previous
    }
  }
}

test("inbox is enabled when the deployment does not define a flag", () => {
  withInboxFlag(undefined, () => assert.equal(isInboxEnabled(), true))
})

test("inbox accepts the explicit production default", () => {
  withInboxFlag(" TRUE ", () => assert.equal(isInboxEnabled(), true))
})

test("inbox can be disabled as an emergency kill switch", () => {
  withInboxFlag("false", () => assert.equal(isInboxEnabled(), false))
})
