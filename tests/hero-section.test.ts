import assert from "node:assert/strict"
import test from "node:test"
import { formatHeroIdentity } from "../components/home/HeroSection"

test("hero identity only renders a separator between non-empty values", () => {
  assert.equal(formatHeroIdentity("QZ Site", "Agent 应用开发"), "QZ Site · Agent 应用开发")
  assert.equal(formatHeroIdentity("QZ Site", ""), "QZ Site")
  assert.equal(formatHeroIdentity("", "Agent 应用开发"), "Agent 应用开发")
  assert.equal(formatHeroIdentity("  ", "  "), "")
})
