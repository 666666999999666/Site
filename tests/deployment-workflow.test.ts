import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

test("the Gitee pipeline builds and deploys one exact commit image", () => {
  const pipeline = readFileSync(".workflow/pipeline-deploy.yml", "utf8")

  const deploy = 'bash "$bootstrap" "$target_commit" "$expected_image"'

  assert.match(pipeline, /step: build@nodejs[\s\S]*?nodeVersion: 14\.16\.0/)
  assert.match(pipeline, /node scripts\/render-release-dockerfile\.mjs "\$\{GITEE_COMMIT\}" Dockerfile\.release source-manifest\.json/)
  assert.match(pipeline, /name: RELEASE_DOCKERFILE/)
  assert.match(pipeline, /- \.\/source-manifest\.json/)
  assert.match(pipeline, /tag: lqzzql\/web:\$\{GITEE_COMMIT\}/)
  assert.match(pipeline, /dockerfile: \.\/Dockerfile\.release/)
  assert.match(pipeline, /- \$\{RELEASE_DOCKERFILE\}/)
  assert.match(pipeline, /dependsOn: prepare_release_dockerfile/)
  assert.match(pipeline, /parameter: \{\}/)
  assert.match(pipeline, /pipeline_commit="\$\{GITEE_COMMIT\}"/)
  assert.match(pipeline, /\$\{GITEE_DOCKER_IMAGE\}" = "\$expected_image"/)
  assert.match(pipeline, /mktemp -d \/dev\/shm\/qzsite-docker-config\.XXXXXX/)
  assert.match(pipeline, /export DOCKER_CONFIG="\$docker_config"/)
  assert.match(pipeline, /docker logout ccr\.ccs\.tencentyun\.com/)
  assert.match(pipeline, /rm -rf -- "\$docker_config"/)
  assert.match(pipeline, /production_git_url="https:\/\/gitee\.com\/lqzzql\/Site\.git"/)
  assert.match(pipeline, /git fetch --prune --no-tags "\$production_git_url" "\+refs\/heads\/main:\$production_ref"/)
  assert.doesNotMatch(pipeline, /git fetch --prune origin/)
  assert.match(pipeline, /"\$target_commit" = "\$pipeline_commit"/)
  assert.match(pipeline, /git show "\$\{target_commit\}:ops\/deploy-entry\.sh" > "\$bootstrap"/)
  assert.match(pipeline, new RegExp(deploy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(pipeline, /blocking: true/)
  assert.doesNotMatch(pipeline, /web:latest/)
  assert.doesNotMatch(pipeline, /bash ops\/deploy\.sh/)
  assert.doesNotMatch(pipeline, /maintenance\.sh install-cron/)
  assert.doesNotMatch(pipeline, /maintenance\.sh status/)
})

test("the deployment bootstrap stages every pre-checkout operation from one target commit", () => {
  const entry = readFileSync("ops/deploy-entry.sh", "utf8")

  assert.match(entry, /\^\[0-9a-f\]\{40\}\$/)
  assert.match(entry, /web:\$revision/)
  assert.match(entry, /production_git_url="https:\/\/gitee\.com\/lqzzql\/Site\.git"/)
  assert.match(entry, /git fetch --prune --no-tags "\$production_git_url" "\+refs\/heads\/main:\$production_ref"/)
  assert.match(entry, /\[\[ "\$target_commit" == "\$production_main" \]\]/)
  assert.doesNotMatch(entry, /git fetch --prune origin/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/deploy\.sh" > "\$staged_deploy"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/common\.sh" > "\$staged_common"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/backup\.sh" > "\$staged_backup"/)
  assert.match(
    entry,
    /git show "\$\{target_commit\}:ops\/prepare-study-uploads\.sh" > "\$staged_prepare"/
  )
  assert.match(entry, /git show "\$\{target_commit\}:ops\/smoke-test\.sh" > "\$staged_smoke"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/verify-release\.sh" > "\$staged_verify"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/deploy-watchdog-launcher\.sh" > "\$staged_launcher"/)
  assert.match(entry, /git show "\$\{target_commit\}:ops\/verify-candidate-migration\.sh" > "\$staged_migration_gate"/)
  assert.match(entry, /mv -- "\$launcher_tmp" "\$launcher_path"/)
  assert.doesNotMatch(entry, /crontab/)
  assert.ok(
    entry.indexOf('Deployment watchdog launcher was not installed safely')
      < entry.indexOf('bash "$staged_deploy" "$target_commit" "$requested_image"')
  )
  assert.match(entry, /QZSITE_DEPLOY_COMMON="\$staged_common"/)
  assert.match(entry, /QZSITE_OPS_COMMON="\$staged_common"/)
  assert.match(entry, /QZSITE_DEPLOY_BACKUP="\$staged_backup"/)
  assert.match(entry, /QZSITE_DEPLOY_PREPARE="\$staged_prepare"/)
  assert.match(entry, /QZSITE_DEPLOY_SMOKE="\$staged_smoke"/)
  assert.match(entry, /QZSITE_DEPLOY_VERIFY="\$staged_verify"/)
  assert.match(entry, /QZSITE_DEPLOY_MIGRATION_GATE="\$staged_migration_gate"/)
  assert.match(entry, /bash "\$staged_deploy" "\$target_commit" "\$requested_image"/)
})

test("the target backup runs before checkout and does not require a running Web service", () => {
  const deploy = readFileSync("ops/deploy.sh", "utf8")
  const backup = readFileSync("ops/backup.sh", "utf8")

  assert.match(deploy, /predeploy_backup="\$\{QZSITE_DEPLOY_BACKUP:-\$APP_DIR\/ops\/backup\.sh\}"/)
  assert.match(deploy, /bash "\$predeploy_backup" predeploy/)
  assert.match(deploy, /BACKUP_SET/)
  assert.match(deploy, /bash "\$migration_gate" "\$immutable_image" "\$backup_dump" "\$target_commit"/)
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
  assert.match(deploy, /set_release_env "\$previous_image" "\$previous_release_sha" "\$previous_release_present"/)
  assert.match(deploy, /compose up --pull never --detach --wait/)
  assert.doesNotMatch(deploy.match(/rollback\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "", /docker (?:pull|compose pull)/)
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

test("deployment uses pending state, one migration, public confirmation, and stable history", () => {
  const deploy = readFileSync("ops/deploy.sh", "utf8")

  assert.match(deploy, /flock -w "\$\{QZSITE_DEPLOY_LOCK_WAIT_SECONDS:-30\}"/)
  assert.match(deploy, /target_commit" == "\$production_main/)
  assert.match(deploy, /production_git_url="https:\/\/gitee\.com\/lqzzql\/Site\.git"/)
  assert.doesNotMatch(deploy, /git fetch --prune origin/)
  assert.match(deploy, /trap rollback EXIT/)
  assert.doesNotMatch(deploy, /trap rollback ERR/)
  assert.match(deploy, /source-fingerprint\.mjs \/source \/app\/\.source-manifest\.json "\$target_commit"/)
  assert.match(deploy, /git merge-base --is-ancestor "\$previous_commit" "\$target_commit"/)
  assert.match(deploy, /QZSITE_DEPLOY_MIN_FREE_KB:-5242880/)
  assert.match(deploy, /Pulling the single SHA-tagged candidate image after lock and disk preflight/)
  assert.match(deploy, /org\.opencontainers\.image\.revision/)
  assert.match(deploy, /image_release_sha/)
  assert.match(deploy, /\.deploy-pending/)
  assert.match(deploy, /compose run --rm --no-deps --pull never[\s\S]*?migrate deploy/)
  assert.equal(deploy.match(/migrate deploy/g)?.length, 1)
  const pending = deploy.indexOf('mv -- "$pending_tmp" "$pending_file"')
  const productionCopyGate = deploy.indexOf('bash "$migration_gate" "$immutable_image" "$backup_dump" "$target_commit"')
  const checkout = deploy.indexOf('git checkout --force -B main "$target_commit"')
  const internal = deploy.indexOf('run_release_smoke strict "$target_commit" internal', checkout)
  const publicCheck = deploy.indexOf('run_release_smoke strict "$target_commit" public', internal)
  const stableState = deploy.indexOf('mv -- "$state_tmp" "$state_file"', publicCheck)
  const history = deploy.indexOf('append_stable_history "$target_commit"', stableState)
  const pendingRemoval = deploy.indexOf('rm -f -- "$pending_file"', history)
  assert.ok(productionCopyGate >= 0 && productionCopyGate < pending)
  assert.ok(pending >= 0 && pending < checkout)
  assert.ok(checkout < internal && internal < publicCheck)
  assert.ok(publicCheck < stableState && stableState < history && history < pendingRemoval)
  assert.match(deploy, /Automatic rollback is incomplete; \.deploy-pending is retained/)
  const rollback = deploy.match(/rollback\(\) \{([\s\S]*?)\n\}/)?.[1] ?? ""
  assert.match(rollback, /trap - ERR EXIT/)
  assert.match(rollback, /state_tmp="\$\(mktemp "\$APP_DIR\/\.deploy-state\.XXXXXX"\)"/)
  assert.match(rollback, /chmod 600 "\$state_tmp"[\s\S]*?mv -- "\$state_tmp" "\$state_file"/)
  assert.doesNotMatch(rollback, /> "\$state_file"/)
  assert.match(rollback, /run_release_smoke "\$previous_provenance_mode" "\$previous_commit" public/)
  assert.match(deploy, /QZSITE_ALLOW_LEGACY_RELEASE="\$legacy_release"/)
  assert.match(deploy, /previous_provenance_mode="legacy"/)
})

test("an EXIT rollback trap covers fail helpers that terminate with an explicit exit", () => {
  const bash = process.platform === "win32"
    ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe")
    : "bash"
  const result = spawnSync(bash, ["-c", `
set -Eeuo pipefail
rollback() {
  original_exit=$?
  trap - ERR EXIT
  printf 'rollback:%s\\n' "$original_exit"
  exit "$original_exit"
}
fail() { exit 23; }
trap rollback EXIT
fail
`], { encoding: "utf8" })

  assert.equal(result.status, 23)
  assert.equal(result.stdout, "rollback:23\n")
})

test("the watchdog is silent on no-op and recovers only from local stable artifacts", () => {
  const watchdog = readFileSync("ops/deploy-watchdog.sh", "utf8")

  assert.match(watchdog, /flock -n 9/)
  assert.match(watchdog, /QZSITE_DEPLOY_PENDING_MAX_AGE_SECONDS:-300/)
  assert.match(watchdog, /if \[\[ ! -e "\$pending_file"[\s\S]*?exit 0/)
  assert.match(
    watchdog,
    /if \(\(candidate_state_was_written == 0 && age < maximum_age\)\)[\s\S]*?exit 0/
  )
  assert.match(watchdog, /Previous stable image is unavailable locally; remote pulls are forbidden/)
  assert.match(watchdog, /compose up --pull never/)
  assert.doesNotMatch(watchdog, /docker pull|compose pull/)
  assert.match(watchdog, /state_commit" == "\$target_commit[\s\S]*?append_stable_history/)
  assert.match(watchdog, /Candidate confirmation failed; watchdog will restore/)
  assert.match(watchdog, /mv -- "\$state_tmp" "\$state_file"/)
  assert.match(watchdog, /rm -f -- "\$pending_file"/)
  assert.match(watchdog, /QZSITE_WATCHDOG_SMOKE/)
  assert.match(watchdog, /QZSITE_WATCHDOG_VERIFY/)
  assert.match(watchdog, /QZSITE_WATCHDOG_PREPARE/)
  assert.match(watchdog, /run_watchdog_smoke "\$previous_provenance_mode" "\$previous_commit" public/)
})

test("the persistent watchdog launcher survives a checkout to a commit without recovery scripts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qzsite-watchdog-launcher-"))
  const launcher = path.resolve("ops/deploy-watchdog-launcher.sh")
  const bash = process.platform === "win32"
    ? path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe")
    : "bash"
  const git = (args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" })

  try {
    execFileSync("git", ["init", root], { stdio: "pipe" })
    git(["config", "user.name", "QZ Site Test"])
    git(["config", "user.email", "test@example.invalid"])
    git(["config", "core.autocrlf", "false"])
    writeFileSync(path.join(root, "README.txt"), "old release\n")
    git(["add", "README.txt"])
    git(["commit", "-m", "old release"])
    const oldCommit = git(["rev-parse", "HEAD"]).toString().trim()

    mkdirSync(path.join(root, "ops"), { recursive: true })
    writeFileSync(path.join(root, "ops", "common.sh"), readFileSync("ops/common.sh", "utf8"))
    writeFileSync(path.join(root, "ops", "smoke-test.sh"), "#!/usr/bin/env bash\nexit 0\n")
    writeFileSync(path.join(root, "ops", "verify-release.sh"), "#!/usr/bin/env bash\nexit 0\n")
    writeFileSync(path.join(root, "ops", "prepare-study-uploads.sh"), "#!/usr/bin/env bash\nexit 0\n")
    writeFileSync(
      path.join(root, "ops", "deploy-watchdog.sh"),
      `#!/usr/bin/env bash
set -Eeuo pipefail
source "\$QZSITE_OPS_COMMON"
for staged in "\$QZSITE_WATCHDOG_SMOKE" "\$QZSITE_WATCHDOG_VERIFY" "\$QZSITE_WATCHDOG_PREPARE"; do
  [[ -f "\$staged" ]]
done
[[ "\$APP_DIR" == "\$QZSITE_APP_DIR_OVERRIDE" ]]
printf 'staged-target-watchdog\\n' > "\$APP_DIR/launcher-ran"
`
    )
    git(["add", "ops"])
    git(["commit", "-m", "target recovery scripts"])
    const targetCommit = git(["rev-parse", "HEAD"]).toString().trim()
    git(["checkout", "--detach", oldCommit])
    assert.equal(existsSync(path.join(root, "ops", "deploy-watchdog.sh")), false)

    writeFileSync(path.join(root, ".env"), "WEB_IMAGE=test\n")
    writeFileSync(
      path.join(root, ".deploy-pending"),
      `${targetCommit} target-image target-fingerprint ${oldCommit} previous-image previous-fingerprint 1\n`
    )
    execFileSync(bash, [launcher, root], { stdio: "pipe" })
    assert.equal(readFileSync(path.join(root, "launcher-ran"), "utf8"), "staged-target-watchdog\n")
    assert.equal(existsSync(path.join(root, "ops", "deploy-watchdog.sh")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("maintenance Cron calls the checkout-independent watchdog launcher directly", () => {
  const installer = readFileSync("ops/install-maintenance-cron.sh", "utf8")
  const launcher = readFileSync("ops/deploy-watchdog-launcher.sh", "utf8")

  assert.match(installer, /deploy-watchdog-launcher\.sh/)
  assert.match(installer, /bash %q %q/)
  assert.doesNotMatch(installer, /run-maintenance-cron\.sh deploy-watchdog/)
  for (const dependency of [
    "deploy-watchdog.sh",
    "common.sh",
    "smoke-test.sh",
    "verify-release.sh",
    "prepare-study-uploads.sh",
  ]) {
    assert.ok(launcher.includes(dependency), `${dependency} must be staged from the pending target`)
  }
  assert.match(launcher, /git -C "\$app_dir" show "\$\{target_commit\}:ops\/\$\{dependency\}"/)
  assert.match(launcher, /QZSITE_APP_DIR_OVERRIDE="\$app_dir"/)
})

test("release verification binds Git, environment, OCI metadata, container, and health", () => {
  const verify = readFileSync("ops/verify-release.sh", "utf8")

  assert.match(verify, /QZSITE_ALLOW_LEGACY_RELEASE:-0/)
  assert.match(verify, /org\.opencontainers\.image\.revision/)
  assert.match(verify, /configured_release_sha/)
  assert.match(verify, /running_release_sha/)
  assert.match(verify, /payload\.releaseSha/)
  assert.match(verify, /source_fingerprint/)
  assert.match(verify, /git diff --quiet --ignore-submodules/)
  assert.match(verify, /git diff --cached --quiet --ignore-submodules/)
  assert.match(verify, /--pull never/)
  assert.match(verify, /QZSITE_ALLOW_LEGACY_RELEASE/)
  assert.match(
    verify,
    /if \[\[ "\$allow_legacy_release" == "1" \]\]; then[\s\S]*?recorded stable state as its trust anchor[\s\S]*?else[\s\S]*?source-fingerprint\.mjs \/source \/app\/\.source-manifest\.json "\$state_commit"/
  )
  assert.doesNotMatch(verify, /manifest_args=/)
  assert.match(verify, /Legacy rollback provenance verified without an application releaseSha/)
  assert.match(verify, /An image with APP_RELEASE_SHA cannot use the legacy rollback contract/)
})

test("daily public monitoring bypasses loopback resolution and checks the stable release", () => {
  const monitor = readFileSync(".workflow/pipeline-public-monitor.yml", "utf8")

  assert.match(monitor, /schedule:\s*\n\s*- cron: '17 4 \* \* \?'/)
  assert.match(monitor, /EXPECTED_RELEASE_SHA="\$release_sha" bash ops\/verify-release\.sh/)
  assert.match(monitor, /CURL_RESOLVE="" EXPECTED_RELEASE_SHA="\$release_sha" bash ops\/smoke-test\.sh public/)
  assert.match(monitor, /blocking: true/)
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
