#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

registry_repository="ccr.ccs.tencentyun.com/lqzzql/web"
pending_file="$APP_DIR/.deploy-pending"
state_file="$APP_DIR/.deploy-state"
history_file="$APP_DIR/.deploy-history"
maximum_age="${QZSITE_DEPLOY_PENDING_MAX_AGE_SECONDS:-300}"
[[ "$maximum_age" =~ ^[0-9]+$ ]] \
  || fail "QZSITE_DEPLOY_PENDING_MAX_AGE_SECONDS must be an integer"
watchdog_smoke="${QZSITE_WATCHDOG_SMOKE:-$APP_DIR/ops/smoke-test.sh}"
watchdog_verify="${QZSITE_WATCHDOG_VERIFY:-$APP_DIR/ops/verify-release.sh}"
watchdog_prepare="${QZSITE_WATCHDOG_PREPARE:-$APP_DIR/ops/prepare-study-uploads.sh}"

temp_env=""
state_tmp=""
cleanup() {
  [[ -z "$temp_env" ]] || rm -f -- "$temp_env"
  [[ -z "$state_tmp" ]] || rm -f -- "$state_tmp"
}
trap cleanup EXIT

prepare_operation_lock
exec 9>>"$OPERATION_LOCK_PATH"
if ! flock -n 9; then
  exit 0
fi

if [[ ! -e "$pending_file" && ! -L "$pending_file" ]]; then
  exit 0
fi
[[ -f "$pending_file" && ! -L "$pending_file" ]] \
  || fail "Pending deployment state must be a regular file"
for target_script in "$watchdog_smoke" "$watchdog_verify" "$watchdog_prepare"; do
  [[ -f "$target_script" && ! -L "$target_script" ]] \
    || fail "A staged watchdog dependency is unavailable"
done
require_file "$state_file"

read -r \
  target_commit target_image target_fingerprint \
  previous_commit previous_image previous_fingerprint \
  created_at pending_extra < "$pending_file"
[[ -z "${pending_extra:-}" ]] || fail "Pending deployment state contains unexpected fields"
for commit in "$target_commit" "$previous_commit"; do
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || fail "Pending deployment has an invalid Git commit"
done
for image in "$target_image" "$previous_image"; do
  [[ "$image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web@sha256:[0-9a-f]{64}$ ]] \
    || fail "Pending deployment has an invalid image digest"
done
for fingerprint in "$target_fingerprint" "$previous_fingerprint"; do
  [[ "$fingerprint" =~ ^[0-9a-f]{64}$ ]] \
    || fail "Pending deployment has an invalid source fingerprint"
done
[[ "$created_at" =~ ^[0-9]+$ ]] || fail "Pending deployment has an invalid timestamp"

append_stable_history() {
  local commit="$1"
  local image="$2"
  local fingerprint="$3"
  if [[ -f "$history_file" ]] \
    && awk -v c="$commit" -v i="$image" -v f="$fingerprint" \
      '$1 == c && $2 == i && $3 == f { found = 1 } END { exit !found }' "$history_file"; then
    return
  fi
  printf '%s %s %s %s\n' "$commit" "$image" "$fingerprint" "$(date -u +%s)" >> "$history_file"
  chmod 600 "$history_file"
}

run_watchdog_smoke() {
  local provenance_mode="$1"
  local release_commit="$2"
  local smoke_mode="$3"
  local legacy_release=0
  [[ "$provenance_mode" == "strict" || "$provenance_mode" == "legacy" ]] \
    || fail "Unknown watchdog provenance mode"
  [[ "$smoke_mode" == "internal" || "$smoke_mode" == "public" ]] \
    || fail "Unknown watchdog smoke mode"
  [[ "$provenance_mode" != "legacy" ]] || legacy_release=1
  if [[ "$smoke_mode" == "public" ]]; then
    CURL_RESOLVE="" \
      QZSITE_ALLOW_LEGACY_RELEASE="$legacy_release" \
      EXPECTED_RELEASE_SHA="$release_commit" \
      bash "$watchdog_smoke" public
  else
    QZSITE_ALLOW_LEGACY_RELEASE="$legacy_release" \
      EXPECTED_RELEASE_SHA="$release_commit" \
      bash "$watchdog_smoke" internal
  fi
}

run_watchdog_verify() {
  local provenance_mode="$1"
  local release_commit="$2"
  local legacy_release=0
  [[ "$provenance_mode" == "strict" || "$provenance_mode" == "legacy" ]] \
    || fail "Unknown watchdog provenance mode"
  [[ "$provenance_mode" != "legacy" ]] || legacy_release=1
  QZSITE_ALLOW_LEGACY_RELEASE="$legacy_release" \
    EXPECTED_RELEASE_SHA="$release_commit" \
    bash "$watchdog_verify"
}

read -r state_commit state_image state_fingerprint state_extra < "$state_file"
[[ -z "${state_extra:-}" ]] || fail "Stable deployment state contains unexpected fields"

candidate_state_was_written=0
if [[ "$state_commit" == "$target_commit" \
  && "$state_image" == "$target_image" \
  && "$state_fingerprint" == "$target_fingerprint" ]]; then
  log "Finishing an interrupted confirmation of the deployed candidate"
  if run_watchdog_verify strict "$target_commit" \
    && run_watchdog_smoke strict "$target_commit" public; then
    append_stable_history "$target_commit" "$target_image" "$target_fingerprint"
    rm -f -- "$pending_file"
    log "Pending candidate was already healthy and is now finalized"
    exit 0
  fi
  candidate_state_was_written=1
  log "Candidate confirmation failed; watchdog will restore the previous stable release"
fi

if ((candidate_state_was_written == 0)); then
  [[ "$state_commit" == "$previous_commit" \
    && "$state_image" == "$previous_image" \
    && "$state_fingerprint" == "$previous_fingerprint" ]] \
    || fail "Pending deployment does not agree with the stable deployment state"
fi

now="$(date -u +%s)"
((now >= created_at)) || fail "Pending deployment timestamp is in the future"
age=$((now - created_at))
if ((candidate_state_was_written == 0 && age < maximum_age)); then
  exit 0
fi

log "Recovering the previous stable release from an expired pending deployment"
git cat-file -e "${previous_commit}^{commit}"
docker image inspect "$previous_image" > /dev/null 2>&1 \
  || fail "Previous stable image is unavailable locally; remote pulls are forbidden during recovery"
git checkout --force -B main "$previous_commit" > /dev/null

temp_env="$(mktemp "$APP_DIR/.env.XXXXXX")"
previous_release_present=0
previous_release_sha=""
previous_provenance_mode="strict"
previous_image_revision="$(docker image inspect "$previous_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
previous_image_release_sha="$(
  docker image inspect "$previous_image" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | awk -F= '$1 == "APP_RELEASE_SHA" { print substr($0, index($0, "=") + 1); exit }'
)"
if [[ "$previous_image_revision" == "$previous_commit" \
  && "$previous_image_release_sha" == "$previous_commit" ]]; then
  previous_release_present=1
  previous_release_sha="$previous_commit"
elif [[ (-z "$previous_image_revision" || "$previous_image_revision" == "<no value>") \
  && -z "$previous_image_release_sha" ]]; then
  previous_provenance_mode="legacy"
else
  fail "Previous stable image has inconsistent release provenance"
fi
awk -v image="$previous_image" -v release_sha="$previous_release_sha" \
  -v include_release_sha="$previous_release_present" '
  index($0, "WEB_IMAGE=") == 1 { next }
  index($0, "APP_RELEASE_SHA=") == 1 { next }
  { print }
  END {
    print "WEB_IMAGE=" image
    if (include_release_sha == "1") print "APP_RELEASE_SHA=" release_sha
  }
' "$APP_DIR/.env" > "$temp_env"
chmod 600 "$temp_env"
mv -- "$temp_env" "$APP_DIR/.env"
temp_env=""

bash "$watchdog_prepare" "$previous_image" watchdog-rollback
compose up --pull never --detach --wait --wait-timeout 240
compose exec --no-TTY nginx nginx -t
compose exec --no-TTY nginx nginx -s reload
state_tmp="$(mktemp "$APP_DIR/.deploy-state.XXXXXX")"
printf '%s %s %s\n' "$previous_commit" "$previous_image" "$previous_fingerprint" > "$state_tmp"
chmod 600 "$state_tmp"
mv -- "$state_tmp" "$state_file"
state_tmp=""
run_watchdog_smoke "$previous_provenance_mode" "$previous_commit" internal
run_watchdog_smoke "$previous_provenance_mode" "$previous_commit" public
run_watchdog_verify "$previous_provenance_mode" "$previous_commit"
rm -f -- "$pending_file"
log "Deployment watchdog restored the previous stable release without a registry pull"
