import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("the Gitee deployment agent does not reinstall host cron entries", () => {
  const pipeline = readFileSync(".workflow/pipeline-deploy.yml", "utf8")

  const deploy = "bash ops/deploy.sh origin/main ccr.ccs.tencentyun.com/lqzzql/web:latest"
  const status = "bash ops/maintenance.sh status"

  assert.match(pipeline, new RegExp(deploy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(pipeline, new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(pipeline, /maintenance\.sh install-cron/)
  assert.ok(pipeline.indexOf(deploy) < pipeline.indexOf(status))
})
