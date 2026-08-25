#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

fail() {
  printf '[%s] ERROR: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}

requested_app_dir="${1:-}"
[[ -n "$requested_app_dir" ]] || fail "Watchdog launcher requires the application directory"
app_dir="$(cd -- "$requested_app_dir" && pwd -P)"
[[ -e "$app_dir/.git" && ! -L "$app_dir/.git" ]] \
  || fail "Watchdog launcher target is not a Git worktree"

pending_file="$app_dir/.deploy-pending"
if [[ ! -e "$pending_file" && ! -L "$pending_file" ]]; then
  exit 0
fi
[[ -f "$pending_file" && ! -L "$pending_file" ]] \
  || fail "Pending deployment state must be a regular file"

read -r target_commit _ < "$pending_file"
[[ "$target_commit" =~ ^[0-9a-f]{40}$ ]] \
  || fail "Pending deployment has an invalid target commit"
git -C "$app_dir" cat-file -e "${target_commit}^{commit}" \
  || fail "Pending deployment target commit is unavailable"

staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/qzsite-watchdog.XXXXXX")"
cleanup() {
  rm -rf -- "$staging_dir"
}
trap cleanup EXIT

for dependency in \
  deploy-watchdog.sh \
  common.sh \
  smoke-test.sh \
  verify-release.sh \
  prepare-study-uploads.sh; do
  git -C "$app_dir" show "${target_commit}:ops/${dependency}" > "$staging_dir/$dependency" \
    || fail "Could not stage target watchdog dependency: $dependency"
  chmod 700 "$staging_dir/$dependency"
done

QZSITE_APP_DIR_OVERRIDE="$app_dir" \
  QZSITE_OPS_COMMON="$staging_dir/common.sh" \
  QZSITE_WATCHDOG_SMOKE="$staging_dir/smoke-test.sh" \
  QZSITE_WATCHDOG_VERIFY="$staging_dir/verify-release.sh" \
  QZSITE_WATCHDOG_PREPARE="$staging_dir/prepare-study-uploads.sh" \
  bash "$staging_dir/deploy-watchdog.sh"
