import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const verifyBackup = readFileSync("ops/verify-backup.sh", "utf8")
const backup = readFileSync("ops/backup.sh", "utf8")
const prepareStudyUploads = readFileSync("ops/prepare-study-uploads.sh", "utf8")
const operations = readFileSync("docs/operations.md", "utf8")
const disasterRecovery = readFileSync("docs/disaster-recovery.md", "utf8")
const readme = readFileSync("README.md", "utf8")

test("backup verification safely extracts both upload archives in isolation", () => {
  assert.match(verifyBackup, /restore_tmp="\$\(mktemp -d\)"/)
  assert.match(verifyBackup, /tar --extract --gzip --file "\$uploads_backup"[\s\S]*?--directory "\$restore_tmp"/)
  assert.match(verifyBackup, /tar --extract --gzip --file "\$study_uploads_backup"[\s\S]*?--directory "\$restore_tmp"/)
  assert.match(verifyBackup, /--no-same-owner --no-same-permissions/)
  assert.match(verifyBackup, /rm -rf -- "\$restore_tmp"/)
})

test("public upload archives reject unsafe roots, paths, links, and special files", () => {
  assert.match(verifyBackup, /Public uploads archive must contain one root directory/)
  assert.match(verifyBackup, /\^uploads\/\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*\$/)
  assert.match(verifyBackup, /Links and non-regular files are forbidden in public uploads archive/)
  assert.match(verifyBackup, /Duplicate entry in public uploads archive/)
  assert.match(verifyBackup, /Public uploads extraction produced a symbolic link/)
})

test("new public backups omit transient MCP staging before strict verification", () => {
  assert.match(backup, /--exclude='uploads\/\.mcp-staging'/)
  assert.match(backup, /--exclude='uploads\/\.mcp-staging\/\*\*'/)
  assert.match(verifyBackup, /uploads\/\.mcp-staging\//)
  assert.match(verifyBackup, /Historical MCP staging entry is not a directory/)
  assert.match(verifyBackup, /duplicate MCP staging directories/)
  assert.match(verifyBackup, /unexpected non-regular file/)
  assert.doesNotMatch(verifyBackup, /uploads\/\.mcp-staging\/\[A-Za-z/)
})

test("target backup verification can use the staged common implementation", () => {
  assert.match(verifyBackup, /source "\$\{QZSITE_OPS_COMMON:-/)
})

test("runbooks treat private study uploads as part of the recoverable backup set", () => {
  for (const runbook of [operations, disasterRecovery]) {
    assert.match(runbook, /study-uploads/)
    assert.match(runbook, /`BACKUP_SET`/)
    assert.match(runbook, /Questions 表/)
  }

  assert.match(operations, /首次发布成功后[\s\S]*?maintenance\.sh install-cron/)
  assert.match(operations, /每日 03:20/)
  assert.match(disasterRecovery, /data\/study-uploads/)
  assert.match(disasterRecovery, /crontab -l/)
})

test("private backup and restore use the Web image identity without requiring a running Web service", () => {
  assert.match(backup, /backup_web_image=.*docker inspect/)
  assert.match(backup, /docker image inspect "\$backup_web_image"/)
  assert.match(backup, /docker run --rm --read-only --network none/)
  assert.match(verifyBackup, /docker run --detach --name "\$container"[\s\S]*?--network none/)
  assert.match(backup, /test "\$\(id -u\)" -ne 0/)
  assert.doesNotMatch(backup, /compose exec[^\n]*web/)

  assert.match(prepareStudyUploads, /chown -R "\$1:\$2" "\$target"/)
  assert.match(prepareStudyUploads, /chmod 0750 "\$target"/)
  assert.match(prepareStudyUploads, /mktemp \/study-uploads\/\.deploy-write-probe\.XXXXXX/)
  assert.match(
    disasterRecovery,
    /mv "\$restore_stage\/study-uploads" data\/study-uploads[\s\S]*?bash ops\/prepare-study-uploads\.sh[\s\S]*?docker compose --env-file \.env up/
  )
  assert.match(
    disasterRecovery,
    /Web 服务可以仍未启动[\s\S]*?不依赖 `compose exec web`/
  )
})

test("README documents the complete Question backup and maintenance boundary", () => {
  assert.match(readme, /data\/study-uploads/)
  assert.match(readme, /QuestionImage/)
  assert.match(
    readme,
    /若恢复出的数据库存在 `"QuestionImage"` 表[\s\S]*?storageKey[\s\S]*?byteSize[\s\S]*?sha256/
  )
  assert.match(
    readme,
    /不存在 `"QuestionImage"` 表的上线前旧备份[\s\S]*?数据库 dump[\s\S]*?覆盖两项的校验清单/
  )
  assert.match(readme, /每日 03:20/)
})
