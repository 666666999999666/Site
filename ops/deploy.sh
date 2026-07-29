#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

revision="${1:-origin/main}"
requested_image="${2:-ccr.ccs.tencentyun.com/lqzzql/web:latest}"
[[ "$requested_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web[:@][A-Za-z0-9._:@-]+$ ]] \
  || fail "Unexpected image reference"

exec 9>"/tmp/qzsite-deploy.lock"
flock -w 900 9 || fail "Another deployment is still running"
[[ -d "$APP_DIR/.git" ]] || fail "$APP_DIR is not a Git worktree"

log "Fetching deployment revision"
git fetch --prune origin main
target_commit="$(git rev-parse --verify "${revision}^{commit}")"
origin_main="$(git rev-parse --verify "origin/main^{commit}")"
git merge-base --is-ancestor "$target_commit" "$origin_main" \
  || fail "Requested revision is not part of origin/main"

previous_commit="$(git rev-parse --verify HEAD)"
previous_image="$(awk -F= '$1 == "WEB_IMAGE" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"

log "Creating pre-deployment backup"
bash "$APP_DIR/ops/backup.sh" predeploy

log "Pulling candidate image"
docker pull "$requested_image" > /dev/null
immutable_image="$(docker image inspect "$requested_image" --format '{{index .RepoDigests 0}}')"
[[ "$immutable_image" == ccr.ccs.tencentyun.com/lqzzql/web@sha256:* ]] \
  || fail "Registry did not return an immutable image digest"

set_env_value() {
  local key="$1"
  local value="$2"
  local temp
  temp="$(mktemp "$APP_DIR/.env.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      found = 1
      next
    }
    { print }
    END {
      if (!found) print key "=" value
    }
  ' "$APP_DIR/.env" > "$temp"
  chmod 600 "$temp"
  mv -- "$temp" "$APP_DIR/.env"
}

rollback() {
  local exit_code=$?
  log "Deployment failed; collecting diagnostics"
  compose ps >&2 || true
  compose logs --tail 120 web nginx >&2 || true

  if [[ -n "$previous_image" ]]; then
    log "Restoring previous code and image"
    git checkout --force -B main "$previous_commit" > /dev/null 2>&1 || true
    set_env_value WEB_IMAGE "$previous_image"
    compose pull web nginx db > /dev/null 2>&1 || true
    compose up --detach --wait --wait-timeout 240 || true
  fi
  exit "$exit_code"
}
trap rollback ERR

git checkout --force -B main "$target_commit" > /dev/null
set_env_value WEB_IMAGE "$immutable_image"
compose config --quiet
compose pull db web nginx > /dev/null

log "Starting services and waiting for health checks"
compose up --detach --wait --wait-timeout 240

health="$(
  curl --fail --silent --show-error --retry 5 --retry-delay 2 \
    --resolve liaoqizai.site:443:127.0.0.1 \
    https://liaoqizai.site/api/health
)"
[[ "$health" == *'"status":"ok"'* ]] || fail "Public health endpoint returned an unexpected response"

printf '%s %s\n' "$target_commit" "$immutable_image" > "$APP_DIR/.deploy-state"
chmod 600 "$APP_DIR/.deploy-state"
trap - ERR
docker image prune --force > /dev/null || true

log "Deployment succeeded: ${target_commit:0:12} $immutable_image"
