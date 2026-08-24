import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("the Gitee deployment agent bootstraps the target revision without reinstalling cron", () => {
  const pipeline = readFileSync(".workflow/pipeline-deploy.yml", "utf8")

  const deploy = "bash \"$bootstrap\" \"$target_commit\" ccr.ccs.tencentyun.com/lqzzql/web:latest"
  const status = "bash ops/maintenance.sh status"

  assert.match(pipeline, /git fetch --prune origin '\+refs\/heads\/main:refs\/remotes\/origin\/main'/)
  assert.match(pipeline, /git show "\$\{target_commit\}:ops\/deploy-entry\.sh" > "\$bootstrap"/)
  assert.match(pipeline, new RegExp(deploy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(pipeline, new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(pipeline, /bash ops\/deploy\.sh/)
  assert.doesNotMatch(pipeline, /maintenance\.sh install-cron/)
  assert.ok(pipeline.indexOf(deploy) < pipeline.indexOf(status))
})

test("the deployment bootstrap stages every pre-checkout operation from one target commit", () => {
  const entry = readFileSync("ops/deploy-entry.sh", "utf8")

  assert.match(entry, /git fetch --prune origin '\+refs\/heads\/main:refs\/remotes\/origin\/main'/)
  assert.match(entry, /git merge-base --is-ancestor "\$target_commit" "\$origin_main"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/deploy\.sh" > "\$staged_deploy"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/common\.sh" > "\$staged_common"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/backup\.sh" > "\$staged_backup"/)
  assert.match(
    entry,
    /git show "\$\{target_commit\}:ops\/prepare-study-uploads\.sh" > "\$staged_prepare"/
  )
  assert.match(entry, /QZSITE_DEPLOY_COMMON="\$staged_common"/)
  assert.match(entry, /QZSITE_OPS_COMMON="\$staged_common"/)
  assert.match(entry, /QZSITE_DEPLOY_BACKUP="\$staged_backup"/)
  assert.match(entry, /QZSITE_DEPLOY_PREPARE="\$staged_prepare"/)
  assert.match(entry, /bash "\$staged_deploy" "\$target_commit" "\$requested_image"/)
})

test("the target backup runs before checkout and does not require a running Web service", () => {
  const deploy = readFileSync("ops/deploy.sh", "utf8")
  const backup = readFileSync("ops/backup.sh", "utf8")

  assert.match(deploy, /predeploy_backup="\$\{QZSITE_DEPLOY_BACKUP:-\$APP_DIR\/ops\/backup\.sh\}"/)
  assert.match(deploy, /bash "\$predeploy_backup" predeploy/)
  assert.ok(
    deploy.indexOf('bash "$predeploy_backup" predeploy')
      < deploy.indexOf('git checkout --force -B main "$target_commit"')
  )
  assert.match(backup, /source "\$\{QZSITE_OPS_COMMON:-/)
  assert.match(backup, /docker run --rm --read-only --network none/)
  assert.match(backup, /"\$\{study_mount_args\[@\]\}"/)
  assert.doesNotMatch(backup, /compose exec[^\n]*web/)
})

test("a failed candidate restores upload ownership with the exact prior runtime image", () => {
  const deploy = readFileSync("ops/deploy.sh", "utf8")
  const prepare = readFileSync("ops/prepare-study-uploads.sh", "utf8")

  assert.match(deploy, /previous_runtime_image="\$\(docker inspect "\$previous_container_id" --format '\{\{\.Image\}\}'\)"/)
  assert.match(deploy, /rollback_permissions_image="\$\{previous_runtime_image:-\$previous_image\}"/)
  assert.match(deploy, /bash "\$prepare_study_uploads" "\$rollback_permissions_image" "rollback"/)
  assert.match(prepare, /test "\$\(id -u\)" -ne 0/)
  assert.match(prepare, /mktemp \/study-uploads\/\.deploy-write-probe\.XXXXXX/)
})

test("study upload preparation supports a Docker-owned host data directory", () => {
  const prepare = readFileSync("ops/prepare-study-uploads.sh", "utf8")
  const dockerProvision = '--volume "$study_uploads_path:/study-uploads:rw"'
  const canonicalizeProvisioned =
    'study_uploads_dir="$(realpath -- "$study_uploads_path")"'

  assert.doesNotMatch(prepare, /mkdir -p -- "\$APP_DIR\/data\/study-uploads"/)
  assert.match(prepare, /\[\[ -d "\$data_path" && ! -L "\$data_path" \]\]/)
  assert.match(prepare, /data_root="\$\(realpath -- "\$data_path"\)"/)
  assert.match(prepare, /\[\[ "\$data_root" == "\$data_path" \]\]/)
  assert.match(prepare, /study_uploads_path="\$data_root\/study-uploads"/)
  assert.ok(prepare.includes(dockerProvision))
  assert.ok(prepare.indexOf(dockerProvision) < prepare.indexOf(canonicalizeProvisioned))
})

test("an incomplete rollback never overwrites deployment state with the old release", () => {
  const deploy = readFileSync("ops/deploy.sh", "utf8")

  assert.match(
    deploy,
    /if git checkout --force -B main "\$previous_commit"[\s\S]*?rollback_source_restored=1[\s\S]*?rollback_failed=1/
  )
  assert.match(deploy, /if \(\(rollback_failed == 0 && rollback_source_restored == 1\)\); then/)
  assert.match(deploy, /Leaving deployment state untouched because rollback is incomplete/)
})

test("database health waits for the final TCP server and target database", () => {
  const compose = readFileSync("docker-compose.yml", "utf8")

  assert.match(compose, /PGPASSWORD=\\"\$\$\{POSTGRES_PASSWORD\}\\"/)
  assert.match(compose, /psql --host 127\.0\.0\.1/)
  assert.match(compose, /--dbname \\"\$\$\{POSTGRES_DB\}\\"/)
  assert.match(compose, /--command 'SELECT 1' \| grep -qx 1/)
  assert.doesNotMatch(compose, /pg_isready/)
})

test("deployment smoke enforces the Chinese-only public route contract", () => {
  const smoke = readFileSync("ops/smoke-test.sh", "utf8")

  assert.match(smoke, /root_status=.*[\s\S]*?\[\[ "\$root_status" == "308" \]\]/)
  assert.match(smoke, /\^location:\[\[:space:\]\]\*\(https\?:\/\/\[\^\/\]\+\)\?\/zh/)
  assert.match(smoke, /zh_page=.*[\s\S]*?"\$site_url\/zh"/)
  assert.match(smoke, /zh_page[\s\S]*?<html lang="zh-CN"/)
  assert.match(smoke, /expect_retired_english "\/en"/)
  assert.match(smoke, /expect_retired_english "\/en\/blog\?source=smoke"/)
  assert.match(smoke, /\[\[ "\$status" == "410" \]\]/)
  assert.match(smoke, /grep -Eiq '\^location:'/)
  assert.match(smoke, /energy_status=.*[\s\S]*?\[\[ "\$energy_status" != "410" \]\]/)

  for (const publicPath of [
    "/zh/blog/series",
    "/zh/blog/tags",
    "/zh/blog/archive",
    "/feed.xml",
    "/sitemap.xml",
  ]) {
    assert.ok(smoke.includes(`$site_url${publicPath}`), `${publicPath} must be covered by smoke`)
  }

  assert.doesNotMatch(smoke, /Switch to Chinese|切换到英文/)
})

test("retired English routes bypass trailing-slash canonicalization", () => {
  const nextConfig = readFileSync("next.config.ts", "utf8")
  const proxy = readFileSync("proxy.ts", "utf8")

  assert.match(nextConfig, /skipTrailingSlashRedirect:\s*true/)
  const retiredEnglishCheck = proxy.indexOf("if (isRetiredEnglishPath(pathname))")
  const trailingSlashCheck = proxy.indexOf('if (pathname.length > 1 && pathname.endsWith("/"))')
  assert.ok(retiredEnglishCheck >= 0)
  assert.ok(trailingSlashCheck > retiredEnglishCheck)
  assert.match(proxy, /const canonicalUrl = new URL\(req\.url\)/)
  assert.doesNotMatch(proxy, /const canonicalUrl = req\.nextUrl\.clone\(\)/)
  assert.match(proxy, /canonicalUrl\.pathname\s*=\s*pathname\.replace\(\/\\\/\+\$\/,\s*""\)/)

  for (const matcher of [
    "'/api/:path*'",
    "'/.well-known/:path*'",
    "'/feed.xml/:path*'",
    "'/robots.txt/:path*'",
    "'/sitemap.xml/:path*'",
  ]) {
    assert.ok(proxy.includes(matcher), `${matcher} must retain trailing-slash redirects`)
  }
})
