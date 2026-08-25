#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

revision="${1:-}"
requested_image="${2:-}"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] \
  || fail "Deployment bootstrap requires a full lowercase Git SHA"
[[ "$requested_image" == "ccr.ccs.tencentyun.com/lqzzql/web:$revision" ]] \
  || fail "Deployment bootstrap requires the matching SHA-tagged image"

app_dir="$(pwd -P)"
[[ -d "$app_dir/.git" ]] || fail "$app_dir is not a Git worktree"
[[ -d "$app_dir/ops" && ! -L "$app_dir/ops" ]] \
  || fail "The deployment ops path must be a real directory"

log "Fetching the target deployment entrypoint"
production_git_url="https://gitee.com/lqzzql/Site.git"
production_ref="refs/remotes/gitee-production/main"
git fetch --prune --no-tags "$production_git_url" "+refs/heads/main:$production_ref"
target_commit="$(git rev-parse --verify "${revision}^{commit}")"
production_main="$(git rev-parse --verify "${production_ref}^{commit}")"
[[ "$target_commit" == "$revision" ]] \
  || fail "Requested revision did not resolve exactly"
[[ "$target_commit" == "$production_main" ]] \
  || fail "Refusing to bootstrap a stale deployment"

staged_deploy=""
staged_common=""
staged_backup=""
staged_prepare=""
staged_smoke=""
staged_verify=""
staged_launcher=""
staged_migration_gate=""
launcher_tmp=""
cleanup() {
  [[ -z "$staged_deploy" ]] || rm -f -- "$staged_deploy"
  [[ -z "$staged_common" ]] || rm -f -- "$staged_common"
  [[ -z "$staged_backup" ]] || rm -f -- "$staged_backup"
  [[ -z "$staged_prepare" ]] || rm -f -- "$staged_prepare"
  [[ -z "$staged_smoke" ]] || rm -f -- "$staged_smoke"
  [[ -z "$staged_verify" ]] || rm -f -- "$staged_verify"
  [[ -z "$staged_launcher" ]] || rm -f -- "$staged_launcher"
  [[ -z "$staged_migration_gate" ]] || rm -f -- "$staged_migration_gate"
  [[ -z "$launcher_tmp" ]] || rm -f -- "$launcher_tmp"
}
trap cleanup EXIT

# Keep both files directly under ops/. This makes the target common.sh resolve
# the real repository as APP_DIR even when the checked-out deploy.sh is older.
staged_deploy="$(mktemp "$app_dir/ops/.deploy-bootstrap-deploy.XXXXXX")"
staged_common="$(mktemp "$app_dir/ops/.deploy-bootstrap-common.XXXXXX")"
staged_backup="$(mktemp "$app_dir/ops/.deploy-bootstrap-backup.XXXXXX")"
staged_prepare="$(mktemp "$app_dir/ops/.deploy-bootstrap-prepare.XXXXXX")"
staged_smoke="$(mktemp "$app_dir/ops/.deploy-bootstrap-smoke.XXXXXX")"
staged_verify="$(mktemp "$app_dir/ops/.deploy-bootstrap-verify.XXXXXX")"
staged_launcher="$(mktemp "$app_dir/ops/.deploy-bootstrap-launcher.XXXXXX")"
staged_migration_gate="$(mktemp "$app_dir/ops/.deploy-bootstrap-migration-gate.XXXXXX")"
git show "${target_commit}:ops/deploy.sh" > "$staged_deploy"
git show "${target_commit}:ops/common.sh" > "$staged_common"
git show "${target_commit}:ops/backup.sh" > "$staged_backup"
git show "${target_commit}:ops/prepare-study-uploads.sh" > "$staged_prepare"
git show "${target_commit}:ops/smoke-test.sh" > "$staged_smoke"
git show "${target_commit}:ops/verify-release.sh" > "$staged_verify"
git show "${target_commit}:ops/deploy-watchdog-launcher.sh" > "$staged_launcher"
git show "${target_commit}:ops/verify-candidate-migration.sh" > "$staged_migration_gate"
chmod 700 \
  "$staged_deploy" "$staged_common" "$staged_backup" "$staged_prepare" \
  "$staged_smoke" "$staged_verify" "$staged_launcher" "$staged_migration_gate"

# Refresh the checkout-independent recovery launcher before deploy.sh can create
# .deploy-pending.  Its one-time Cron entry is installed over a trusted SSH
# session because the Gitee Agent deliberately runs with NoNewPrivileges.
watchdog_user="${MAINTENANCE_CRON_USER:-ubuntu}"
id "$watchdog_user" >/dev/null 2>&1 \
  || fail "Deployment watchdog user does not exist: $watchdog_user"
watchdog_group="$(id -gn "$watchdog_user")"
watchdog_home="$(getent passwd "$watchdog_user" | awk -F: 'NR == 1 { print $6 }')"
[[ "$watchdog_home" == /* && -d "$watchdog_home" && ! -L "$watchdog_home" ]] \
  || fail "Deployment watchdog home is unsafe"
launcher_dir="$watchdog_home/.local/lib/qzsite"
launcher_path="$launcher_dir/deploy-watchdog-launcher.sh"

if [[ "$(id -u)" -eq 0 ]]; then
  install -d -m 700 -o "$watchdog_user" -g "$watchdog_group" "$launcher_dir"
elif [[ "$(id -un)" == "$watchdog_user" ]]; then
  install -d -m 700 "$launcher_dir"
else
  fail "Deployment bootstrap must run as root or $watchdog_user"
fi
[[ -d "$launcher_dir" && ! -L "$launcher_dir" ]] \
  || fail "Deployment watchdog launcher directory is unsafe"
launcher_tmp="$(mktemp "$launcher_dir/.deploy-watchdog-launcher.XXXXXX")"
install -m 700 "$staged_launcher" "$launcher_tmp"
if [[ "$(id -u)" -eq 0 ]]; then
  chown "$watchdog_user:$watchdog_group" "$launcher_tmp"
fi
mv -- "$launcher_tmp" "$launcher_path"
launcher_tmp=""
[[ -x "$launcher_path" && ! -L "$launcher_path" ]] \
  || fail "Deployment watchdog launcher was not installed safely"
log "Checkout-independent deployment watchdog launcher refreshed"

log "Executing deployment logic from ${target_commit:0:12}"
QZSITE_DEPLOY_COMMON="$staged_common" \
  QZSITE_OPS_COMMON="$staged_common" \
  QZSITE_DEPLOY_BACKUP="$staged_backup" \
  QZSITE_DEPLOY_PREPARE="$staged_prepare" \
  QZSITE_DEPLOY_SMOKE="$staged_smoke" \
  QZSITE_DEPLOY_VERIFY="$staged_verify" \
  QZSITE_DEPLOY_MIGRATION_GATE="$staged_migration_gate" \
  bash "$staged_deploy" "$target_commit" "$requested_image"
