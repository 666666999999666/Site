#!/usr/bin/env bash

source "${QZSITE_DEPLOY_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

registry_repository="ccr.ccs.tencentyun.com/lqzzql/web"
target_commit="${1:-}"
requested_image="${2:-}"

[[ "$target_commit" =~ ^[0-9a-f]{40}$ ]] \
  || fail "Deployment revision must be a full lowercase Git SHA"
[[ "$requested_image" == "$registry_repository:$target_commit" ]] \
  || fail "Deployment image must use the exact target Git SHA tag"

prepare_operation_lock
exec 9>>"$OPERATION_LOCK_PATH"
flock -w "${QZSITE_DEPLOY_LOCK_WAIT_SECONDS:-30}" 9 \
  || fail "Another deployment or recovery operation is still running"
[[ -d "$APP_DIR/.git" ]] || fail "$APP_DIR is not a Git worktree"

log "Fetching and validating the exact deployment revision"
production_git_url="https://gitee.com/lqzzql/Site.git"
production_ref="refs/remotes/gitee-production/main"
git fetch --prune --no-tags "$production_git_url" "+refs/heads/main:$production_ref"
production_main="$(git rev-parse --verify "${production_ref}^{commit}")"
[[ "$target_commit" == "$production_main" ]] \
  || fail "Refusing a stale deployment: target is not the current Gitee main"
git cat-file -e "${target_commit}^{commit}"

minimum_free_kb="${QZSITE_DEPLOY_MIN_FREE_KB:-5242880}"
[[ "$minimum_free_kb" =~ ^[0-9]+$ ]] \
  || fail "QZSITE_DEPLOY_MIN_FREE_KB must be an integer"
available_kb="$(df -Pk "$APP_DIR" | awk 'NR == 2 { print $4 }')"
[[ "$available_kb" =~ ^[0-9]+$ ]] \
  || fail "Could not determine available deployment disk space"
((available_kb >= minimum_free_kb)) \
  || fail "Deployment disk preflight failed: ${available_kb} KiB available"
docker info > /dev/null

state_file="$APP_DIR/.deploy-state"
pending_file="$APP_DIR/.deploy-pending"
history_file="$APP_DIR/.deploy-history"
require_file "$state_file"
read -r previous_commit previous_image previous_fingerprint state_extra < "$state_file"
[[ -z "${state_extra:-}" ]] || fail "Deployment state contains unexpected fields"
[[ "$previous_commit" =~ ^[0-9a-f]{40}$ ]] \
  || fail "Existing deployment state has an invalid Git commit"
[[ "$previous_image" == "$registry_repository@sha256:"* ]] \
  || fail "Existing deployment state has an invalid image digest"
[[ "$previous_fingerprint" =~ ^[0-9a-f]{64}$ ]] \
  || fail "Existing deployment state has an invalid source fingerprint"
[[ "$(git rev-parse --verify HEAD)" == "$previous_commit" ]] \
  || fail "Checked-out source does not match the stable deployment state"
git merge-base --is-ancestor "$previous_commit" "$target_commit" \
  || fail "Refusing to downgrade or deploy an unrelated Git history"
[[ ! -e "$pending_file" && ! -L "$pending_file" ]] \
  || fail "An unfinished deployment is pending recovery"

configured_previous_image="$(awk -F= '$1 == "WEB_IMAGE" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
[[ "$configured_previous_image" == "$previous_image" ]] \
  || fail "WEB_IMAGE does not match the stable deployment state"
previous_release_present=0
previous_release_sha=""
if grep -q '^APP_RELEASE_SHA=' "$APP_DIR/.env"; then
  previous_release_present=1
  previous_release_sha="$(awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
fi

previous_container_id="$(compose ps --quiet web 2>/dev/null || true)"
previous_runtime_image=""
if [[ -n "$previous_container_id" ]]; then
  previous_runtime_image="$(docker inspect "$previous_container_id" --format '{{.Image}}')"
  [[ "$previous_runtime_image" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "Running Web container returned an invalid image ID"
fi
docker image inspect "$previous_image" > /dev/null 2>&1 \
  || fail "The stable rollback image is not available locally"

previous_image_revision="$(docker image inspect "$previous_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
previous_image_release_sha="$(
  docker image inspect "$previous_image" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1); exit }'
)"
previous_provenance_mode="strict"
if [[ "$previous_image_revision" == "$previous_commit" \
  && "$previous_image_release_sha" == "$previous_commit" ]]; then
  [[ "$previous_release_present" == "1" && "$previous_release_sha" == "$previous_commit" ]] \
    || fail "Stable release environment does not match its strict image provenance"
elif [[ (-z "$previous_image_revision" || "$previous_image_revision" == "<no value>") \
  && -z "$previous_image_release_sha" ]]; then
  [[ "$previous_release_present" == "0" ]] \
    || fail "Legacy rollback image must not have APP_RELEASE_SHA configured"
  previous_provenance_mode="legacy"
else
  fail "Stable rollback image has inconsistent release provenance"
fi

set_release_env() {
  local image="$1"
  local release_sha="$2"
  local include_release_sha="$3"
  local temp
  temp="$(mktemp "$APP_DIR/.env.XXXXXX")"
  awk -v image="$image" -v release_sha="$release_sha" -v include_release_sha="$include_release_sha" '
    index($0, "WEB_IMAGE=") == 1 { next }
    index($0, "APP_RELEASE_SHA=") == 1 { next }
    { print }
    END {
      print "WEB_IMAGE=" image
      if (include_release_sha == "1") print "APP_RELEASE_SHA=" release_sha
    }
  ' "$APP_DIR/.env" > "$temp"
  chmod 600 "$temp"
  mv -- "$temp" "$APP_DIR/.env"
}

append_stable_history() {
  local commit="$1"
  local image="$2"
  local fingerprint="$3"
  local recorded_at
  recorded_at="$(date -u +%s)"
  if [[ -f "$history_file" ]] \
    && awk -v c="$commit" -v i="$image" -v f="$fingerprint" \
      '$1 == c && $2 == i && $3 == f { found = 1 } END { exit !found }' "$history_file"; then
    return
  fi
  printf '%s %s %s %s\n' "$commit" "$image" "$fingerprint" "$recorded_at" >> "$history_file"
  chmod 600 "$history_file"
}

predeploy_backup="${QZSITE_DEPLOY_BACKUP:-$APP_DIR/ops/backup.sh}"
prepare_study_uploads="${QZSITE_DEPLOY_PREPARE:-$APP_DIR/ops/prepare-study-uploads.sh}"
release_smoke="${QZSITE_DEPLOY_SMOKE:-$APP_DIR/ops/smoke-test.sh}"
release_verify="${QZSITE_DEPLOY_VERIFY:-$APP_DIR/ops/verify-release.sh}"
migration_gate="${QZSITE_DEPLOY_MIGRATION_GATE:-$APP_DIR/ops/verify-candidate-migration.sh}"
[[ -f "$predeploy_backup" && ! -L "$predeploy_backup" ]] \
  || fail "Target pre-deployment backup script is unavailable"
[[ -f "$prepare_study_uploads" && ! -L "$prepare_study_uploads" ]] \
  || fail "Target study upload preparation script is unavailable"
[[ -f "$release_smoke" && ! -L "$release_smoke" ]] \
  || fail "Target release smoke script is unavailable"
[[ -f "$release_verify" && ! -L "$release_verify" ]] \
  || fail "Target release verification script is unavailable"
[[ -f "$migration_gate" && ! -L "$migration_gate" ]] \
  || fail "Target candidate migration gate is unavailable"

run_release_smoke() {
  local provenance_mode="$1"
  local release_commit="$2"
  local smoke_mode="$3"
  local legacy_release=0
  [[ "$provenance_mode" == "strict" || "$provenance_mode" == "legacy" ]] \
    || fail "Unknown release provenance mode"
  [[ "$smoke_mode" == "internal" || "$smoke_mode" == "public" ]] \
    || fail "Unknown release smoke mode"
  [[ "$provenance_mode" != "legacy" ]] || legacy_release=1
  if [[ "$smoke_mode" == "public" ]]; then
    CURL_RESOLVE="" \
      QZSITE_ALLOW_LEGACY_RELEASE="$legacy_release" \
      EXPECTED_RELEASE_SHA="$release_commit" \
      bash "$release_smoke" public
  else
    QZSITE_ALLOW_LEGACY_RELEASE="$legacy_release" \
      EXPECTED_RELEASE_SHA="$release_commit" \
      bash "$release_smoke" internal
  fi
}

run_release_verify() {
  local provenance_mode="$1"
  local release_commit="$2"
  local legacy_release=0
  [[ "$provenance_mode" == "strict" || "$provenance_mode" == "legacy" ]] \
    || fail "Unknown release provenance mode"
  [[ "$provenance_mode" != "legacy" ]] || legacy_release=1
  QZSITE_ALLOW_LEGACY_RELEASE="$legacy_release" \
    EXPECTED_RELEASE_SHA="$release_commit" \
    bash "$release_verify"
}

log "Creating pre-deployment backup"
backup_output="$(bash "$predeploy_backup" predeploy)"
printf '%s\n' "$backup_output"
backup_set="$(printf '%s\n' "$backup_output" | awk -F= '$1 == "BACKUP_SET" { print $2; exit }')"
[[ "$backup_set" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-predeploy$ ]] \
  || fail "Pre-deployment backup did not return a valid backup set"
backup_dump="$BACKUP_DIR/${backup_set}.dump"
require_file "$backup_dump"

log "Pulling the single SHA-tagged candidate image after lock and disk preflight"
docker pull "$requested_image" > /dev/null
immutable_image="$(
  docker image inspect "$requested_image" --format '{{range .RepoDigests}}{{println .}}{{end}}' \
    | awk -v prefix="$registry_repository@sha256:" 'index($0, prefix) == 1 { print; exit }'
)"
[[ "$immutable_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web@sha256:[0-9a-f]{64}$ ]] \
  || fail "Registry did not return the expected immutable image digest"

image_revision="$(docker image inspect "$immutable_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "$image_revision" == "$target_commit" ]] \
  || fail "Candidate OCI revision does not match the requested Git SHA"
image_release_sha="$(
  docker image inspect "$immutable_image" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1); exit }'
)"
[[ "$image_release_sha" == "$target_commit" ]] \
  || fail "Candidate APP_RELEASE_SHA does not match the requested Git SHA"

image_fingerprint="$(
  docker run --rm --pull never --read-only --network none \
    --entrypoint cat \
    "$immutable_image" \
    /app/.source-fingerprint
)"
[[ "$image_fingerprint" =~ ^[0-9a-f]{64}$ ]] \
  || fail "Candidate image has an invalid source fingerprint"

if [[ "$target_commit" == "$previous_commit" ]]; then
  [[ "$immutable_image" == "$previous_image" ]] \
    || fail "A stable Git SHA is already bound to a different image digest"
  [[ "$image_fingerprint" == "$previous_fingerprint" ]] \
    || fail "A stable Git SHA is already bound to a different source fingerprint"
  run_release_verify strict "$target_commit"
  run_release_smoke strict "$target_commit" public
  append_stable_history "$target_commit" "$immutable_image" "$image_fingerprint"
  log "Release is already stable and verified: ${target_commit:0:12}"
  exit 0
fi

log "Validating candidate migrations against an isolated production backup copy"
bash "$migration_gate" "$immutable_image" "$backup_dump" "$target_commit"

pending_tmp=""
state_tmp=""
rollback() {
  local original_exit=$?
  local rollback_failed=0
  local rollback_permissions_image
  trap - ERR EXIT
  [[ -z "$pending_tmp" ]] || rm -f -- "$pending_tmp"
  [[ -z "$state_tmp" ]] || rm -f -- "$state_tmp"
  log "Deployment failed; collecting diagnostics before local-only rollback"
  compose ps >&2 || true
  compose logs --tail 120 web nginx >&2 || true

  if ! git checkout --force -B main "$previous_commit" > /dev/null 2>&1; then
    rollback_failed=1
    log "ERROR: Could not restore the previous Git commit" >&2
  fi
  set_release_env "$previous_image" "$previous_release_sha" "$previous_release_present"
  rollback_permissions_image="${previous_runtime_image:-$previous_image}"
  if ! bash "$prepare_study_uploads" "$rollback_permissions_image" "rollback"; then
    rollback_failed=1
  fi
  if ! compose up --pull never --detach --wait --wait-timeout 240; then
    rollback_failed=1
  fi
  if ! compose exec --no-TTY nginx nginx -t > /dev/null 2>&1 \
    || ! compose exec --no-TTY nginx nginx -s reload > /dev/null 2>&1; then
    rollback_failed=1
  fi
  state_tmp="$(mktemp "$APP_DIR/.deploy-state.XXXXXX")"
  printf '%s %s %s\n' \
    "$previous_commit" "$previous_image" "$previous_fingerprint" > "$state_tmp"
  chmod 600 "$state_tmp"
  mv -- "$state_tmp" "$state_file"
  state_tmp=""
  if ! run_release_smoke "$previous_provenance_mode" "$previous_commit" internal \
    || ! run_release_smoke "$previous_provenance_mode" "$previous_commit" public \
    || ! run_release_verify "$previous_provenance_mode" "$previous_commit"; then
    rollback_failed=1
  fi

  if ((rollback_failed == 0)); then
    rm -f -- "$pending_file"
    log "Rollback restored and verified the previous stable release"
    exit "$original_exit"
  fi
  log "ERROR: Automatic rollback is incomplete; .deploy-pending is retained for watchdog recovery" >&2
  exit 70
}

pending_tmp="$(mktemp "$APP_DIR/.deploy-pending.XXXXXX")"
printf '%s %s %s %s %s %s %s\n' \
  "$target_commit" "$immutable_image" "$image_fingerprint" \
  "$previous_commit" "$previous_image" "$previous_fingerprint" \
  "$(date -u +%s)" > "$pending_tmp"
chmod 600 "$pending_tmp"
mv -- "$pending_tmp" "$pending_file"
pending_tmp=""
trap rollback EXIT

git checkout --force -B main "$target_commit" > /dev/null

source_fingerprint="$(
  docker run --rm --pull never --read-only --network none \
    --volume "$APP_DIR:/source:ro" \
    --entrypoint node \
    "$immutable_image" \
    /prisma/tools/scripts/source-fingerprint.mjs /source /app/.source-manifest.json "$target_commit"
)"
[[ "$source_fingerprint" == "$image_fingerprint" ]] \
  || fail "Candidate image does not match the requested Git revision"

log "Preparing private study uploads for the candidate runtime identity"
bash "$prepare_study_uploads" "$immutable_image" "candidate"
set_release_env "$immutable_image" "$target_commit" 1
compose config --quiet

log "Applying Prisma migrations exactly once before application startup"
compose run --rm --no-deps --pull never --entrypoint sh web -ceu '
  cd /app
  export NODE_PATH=/prisma/node_modules
  exec node /prisma/node_modules/prisma/build/index.js migrate deploy
'

log "Starting the candidate from local immutable images"
compose up --pull never --detach --wait --wait-timeout 240

log "Validating and reloading Nginx configuration"
compose exec --no-TTY nginx nginx -t
compose exec --no-TTY nginx nginx -s reload

log "Running internal release verification"
run_release_smoke strict "$target_commit" internal

log "Running real public DNS, TLS, route, and release verification"
run_release_smoke strict "$target_commit" public

state_tmp="$(mktemp "$APP_DIR/.deploy-state.XXXXXX")"
printf '%s %s %s\n' "$target_commit" "$immutable_image" "$image_fingerprint" > "$state_tmp"
chmod 600 "$state_tmp"
mv -- "$state_tmp" "$state_file"
state_tmp=""
run_release_verify strict "$target_commit"
append_stable_history "$target_commit" "$immutable_image" "$image_fingerprint"
rm -f -- "$pending_file"

trap - EXIT
chmod 600 "$state_file" "$history_file"
log "Deployment finalized: ${target_commit:0:12} $immutable_image $image_fingerprint"
