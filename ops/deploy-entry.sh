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

revision="${1:-origin/main}"
requested_image="${2:-ccr.ccs.tencentyun.com/lqzzql/web:latest}"
[[ "$requested_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web[:@][A-Za-z0-9._:@-]+$ ]] \
  || fail "Unexpected image reference"

app_dir="$(pwd -P)"
[[ -d "$app_dir/.git" ]] || fail "$app_dir is not a Git worktree"
[[ -d "$app_dir/ops" && ! -L "$app_dir/ops" ]] \
  || fail "The deployment ops path must be a real directory"

log "Fetching the target deployment entrypoint"
git fetch --prune origin '+refs/heads/main:refs/remotes/origin/main'
target_commit="$(git rev-parse --verify "${revision}^{commit}")"
origin_main="$(git rev-parse --verify "origin/main^{commit}")"
git merge-base --is-ancestor "$target_commit" "$origin_main" \
  || fail "Requested revision is not part of origin/main"

staged_deploy=""
staged_common=""
staged_backup=""
staged_prepare=""
cleanup() {
  [[ -z "$staged_deploy" ]] || rm -f -- "$staged_deploy"
  [[ -z "$staged_common" ]] || rm -f -- "$staged_common"
  [[ -z "$staged_backup" ]] || rm -f -- "$staged_backup"
  [[ -z "$staged_prepare" ]] || rm -f -- "$staged_prepare"
}
trap cleanup EXIT

# Keep both files directly under ops/. This makes the target common.sh resolve
# the real repository as APP_DIR even when the checked-out deploy.sh is older.
staged_deploy="$(mktemp "$app_dir/ops/.deploy-bootstrap-deploy.XXXXXX")"
staged_common="$(mktemp "$app_dir/ops/.deploy-bootstrap-common.XXXXXX")"
staged_backup="$(mktemp "$app_dir/ops/.deploy-bootstrap-backup.XXXXXX")"
staged_prepare="$(mktemp "$app_dir/ops/.deploy-bootstrap-prepare.XXXXXX")"
git show "${target_commit}:ops/deploy.sh" > "$staged_deploy"
git show "${target_commit}:ops/common.sh" > "$staged_common"
git show "${target_commit}:ops/backup.sh" > "$staged_backup"
git show "${target_commit}:ops/prepare-study-uploads.sh" > "$staged_prepare"
chmod 700 "$staged_deploy" "$staged_common" "$staged_backup" "$staged_prepare"

log "Executing deployment logic from ${target_commit:0:12}"
QZSITE_DEPLOY_COMMON="$staged_common" \
  QZSITE_OPS_COMMON="$staged_common" \
  QZSITE_DEPLOY_BACKUP="$staged_backup" \
  QZSITE_DEPLOY_PREPARE="$staged_prepare" \
  bash "$staged_deploy" "$target_commit" "$requested_image"
