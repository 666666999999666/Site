#!/usr/bin/env bash

source "${QZSITE_DEPLOY_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

revision="${1:-origin/main}"
requested_image="${2:-ccr.ccs.tencentyun.com/lqzzql/web:latest}"
[[ "$requested_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web[:@][A-Za-z0-9._:@-]+$ ]] \
  || fail "Unexpected image reference"

exec 9>"/tmp/qzsite-operation.lock"
flock -w 900 9 || fail "Another deployment is still running"
[[ -d "$APP_DIR/.git" ]] || fail "$APP_DIR is not a Git worktree"

log "Fetching deployment revision"
git fetch --prune origin '+refs/heads/main:refs/remotes/origin/main'
target_commit="$(git rev-parse --verify "${revision}^{commit}")"
origin_main="$(git rev-parse --verify "origin/main^{commit}")"
git merge-base --is-ancestor "$target_commit" "$origin_main" \
  || fail "Requested revision is not part of origin/main"

previous_commit="$(git rev-parse --verify HEAD)"
previous_image="$(awk -F= '$1 == "WEB_IMAGE" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
previous_container_id="$(compose ps --quiet web 2>/dev/null || true)"
previous_runtime_image=""
if [[ -n "$previous_container_id" ]]; then
  previous_runtime_image="$(docker inspect "$previous_container_id" --format '{{.Image}}')"
  [[ "$previous_runtime_image" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "Running Web container returned an invalid image ID"
fi
previous_state="$(cat "$APP_DIR/.deploy-state" 2>/dev/null || true)"
state_tmp=""
predeploy_backup="${QZSITE_DEPLOY_BACKUP:-$APP_DIR/ops/backup.sh}"
prepare_study_uploads="${QZSITE_DEPLOY_PREPARE:-$APP_DIR/ops/prepare-study-uploads.sh}"
[[ -f "$predeploy_backup" && ! -L "$predeploy_backup" ]] \
  || fail "Target pre-deployment backup script is unavailable"
[[ -f "$prepare_study_uploads" && ! -L "$prepare_study_uploads" ]] \
  || fail "Target study upload preparation script is unavailable"

log "Creating pre-deployment backup"
bash "$predeploy_backup" predeploy

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
  local rollback_failed=0
  local rollback_permissions_image
  local rollback_source_restored=0
  [[ -n "$state_tmp" ]] && rm -f -- "$state_tmp"
  log "Deployment failed; collecting diagnostics"
  compose ps >&2 || true
  compose logs --tail 120 web nginx >&2 || true

  if [[ -n "$previous_image" ]]; then
    log "Restoring previous code and image"
    if git checkout --force -B main "$previous_commit" > /dev/null 2>&1; then
      rollback_source_restored=1
    else
      rollback_failed=1
      log "ERROR: Could not restore the previous Git commit" >&2
    fi
    set_env_value WEB_IMAGE "$previous_image"
    compose pull web nginx db > /dev/null 2>&1 || rollback_failed=1
    rollback_permissions_image="${previous_runtime_image:-$previous_image}"
    if ! bash "$prepare_study_uploads" "$rollback_permissions_image" "rollback"; then
      rollback_failed=1
    fi
    compose up --detach --wait --wait-timeout 240 || rollback_failed=1
    compose exec --no-TTY nginx nginx -t > /dev/null 2>&1 \
      && compose exec --no-TTY nginx nginx -s reload > /dev/null 2>&1 \
      || rollback_failed=1
  fi
  if ((rollback_failed == 0 && rollback_source_restored == 1)); then
    if [[ -n "$previous_state" ]]; then
      printf '%s\n' "$previous_state" > "$APP_DIR/.deploy-state"
      chmod 600 "$APP_DIR/.deploy-state"
    else
      rm -f -- "$APP_DIR/.deploy-state"
    fi
  else
    log "ERROR: Leaving deployment state untouched because rollback is incomplete" >&2
  fi
  if ((rollback_failed != 0)); then
    log "ERROR: Automatic rollback did not pass every recovery check" >&2
  fi
  exit "$exit_code"
}
trap rollback ERR

git checkout --force -B main "$target_commit" > /dev/null

image_fingerprint="$(
  docker run --rm --read-only --network none \
    --entrypoint cat \
    "$immutable_image" \
    /app/.source-fingerprint
)"
[[ "$image_fingerprint" =~ ^[0-9a-f]{64}$ ]] \
  || fail "Candidate image has an invalid source fingerprint"

source_fingerprint="$(
  docker run --rm --read-only --network none \
    --volume "$APP_DIR:/source:ro" \
    --entrypoint node \
    "$immutable_image" \
    /prisma/tools/scripts/source-fingerprint.mjs /source
)"
[[ "$source_fingerprint" == "$image_fingerprint" ]] \
  || fail "Candidate image does not match the requested Git revision"

log "Preparing private study uploads for the candidate runtime identity"
bash "$prepare_study_uploads" "$immutable_image" "candidate"

set_env_value WEB_IMAGE "$immutable_image"
compose config --quiet
compose pull db web nginx > /dev/null

log "Starting services and waiting for health checks"
compose up --detach --wait --wait-timeout 240

log "Validating and reloading Nginx configuration"
compose exec --no-TTY nginx nginx -t
compose exec --no-TTY nginx nginx -s reload

bash "$APP_DIR/ops/smoke-test.sh"

state_tmp="$(mktemp "$APP_DIR/.deploy-state.XXXXXX")"
printf '%s %s %s\n' "$target_commit" "$immutable_image" "$image_fingerprint" > "$state_tmp"
chmod 600 "$state_tmp"
mv -- "$state_tmp" "$APP_DIR/.deploy-state"
state_tmp=""
bash "$APP_DIR/ops/verify-release.sh"

chmod 600 "$APP_DIR/.deploy-state"
trap - ERR
docker image prune --force > /dev/null || true

log "Deployment succeeded: ${target_commit:0:12} $immutable_image $image_fingerprint"
