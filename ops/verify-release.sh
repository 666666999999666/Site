#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

state_file="$APP_DIR/.deploy-state"
require_file "$state_file"
read -r state_commit state_image state_fingerprint extra < "$state_file"

[[ -z "${extra:-}" ]] || fail "Deployment state contains unexpected fields"
[[ "$state_commit" =~ ^[0-9a-f]{40}$ ]] || fail "Deployment state has an invalid Git commit"
[[ "$state_image" == ccr.ccs.tencentyun.com/lqzzql/web@sha256:* ]] \
  || fail "Deployment state has an invalid image reference"
legacy_state=0
if [[ -z "${state_fingerprint:-}" ]]; then
  legacy_state=1
else
  [[ "$state_fingerprint" =~ ^[0-9a-f]{64}$ ]] \
    || fail "Deployment state has an invalid source fingerprint"
fi

current_commit="$(git rev-parse --verify HEAD)"
[[ "$current_commit" == "$state_commit" ]] \
  || fail "Checked-out source does not match deployment state"

web_container="$(compose ps --quiet web)"
[[ -n "$web_container" ]] || fail "Web container is not running"
[[ "$(docker inspect --format '{{.State.Running}}' "$web_container")" == "true" ]] \
  || fail "Web container is not running"

running_image_id="$(docker inspect --format '{{.Image}}' "$web_container")"
expected_image_id="$(docker image inspect "$state_image" --format '{{.Id}}')"
[[ "$running_image_id" == "$expected_image_id" ]] \
  || fail "Running web container does not use the recorded image"

image_fingerprint="$(docker exec "$web_container" cat /app/.source-fingerprint)"
[[ "$image_fingerprint" =~ ^[0-9a-f]{64}$ ]] \
  || fail "Running image has an invalid source fingerprint"
if ((legacy_state == 0)); then
  [[ "$image_fingerprint" == "$state_fingerprint" ]] \
    || fail "Running image fingerprint does not match deployment state"
fi

source_fingerprint="$(
  docker run --rm --read-only --network none \
    --volume "$APP_DIR:/source:ro" \
    --entrypoint node \
    "$state_image" \
    /prisma/tools/scripts/source-fingerprint.mjs /source
)"
[[ "$source_fingerprint" == "$image_fingerprint" ]] \
  || fail "Checked-out source does not match the running image"

if ((legacy_state == 1)); then
  log "Legacy two-field deployment state verified; the next deployment will record the source fingerprint"
fi
log "Release provenance verified: ${state_commit:0:12} ${state_image#*@}"
